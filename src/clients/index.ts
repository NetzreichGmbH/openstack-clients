import * as Compute from "./compute";
import * as Network from "./network";
import * as Identity from "./identity";
import { BaseAPI } from "./identity/base";
import { Logger, LoggerInterface } from "./logger";
import { time } from "console";
import { AxiosError } from "axios";

type ComputeType = ReturnType<typeof Compute.ExtensionsApiFactory> &
  ReturnType<typeof Compute.OsSimpleTenantUsageApiFactory> &
  ReturnType<typeof Compute.ServersApiFactory> &
  ReturnType<typeof Compute.FlavorsApiFactory> &
  ReturnType<typeof Compute.ImagesApiFactory> &
  ReturnType<typeof Compute.OsKeypairsApiFactory>;

type NetworkType = ReturnType<typeof Network.NetworksApiFactory> &
  ReturnType<typeof Network.SubnetsApiFactory> &
  ReturnType<typeof Network.PortsApiFactory> &
  ReturnType<typeof Network.SecurityGroupsApiFactory> &
  ReturnType<typeof Network.SecurityGroupRulesApiFactory> &
  ReturnType<typeof Network.FloatingipPoolsApiFactory>;
type IdentityType = ReturnType<typeof Identity.AuthApiFactory> &
  ReturnType<typeof Identity.RolesApiFactory> &
  ReturnType<typeof Identity.UsersApiFactory> &
  ReturnType<typeof Identity.ProjectsApiFactory> &
  ReturnType<typeof Identity.DomainsApiFactory> &
  ReturnType<typeof Identity.ServicesApiFactory> &
  ReturnType<typeof Identity.EndpointsApiFactory> &
  ReturnType<typeof Identity.GroupsApiFactory>;
export default class OpenStack {
  public Compute: ComputeType;
  public Identity: IdentityType;
  public Network: NetworkType;

  private configuration: Identity.Configuration;

  private _token?: string;

  private _catalog?: Identity.AuthCatalogGetResponseCatalogInner[];

  private expires_at?: Date;

  private _retry: ReturnType<typeof setTimeout> | undefined;

  constructor(
    configuration: Identity.Configuration,
    private _auth: Identity.AuthTokensPostRequest,
    private logger: LoggerInterface = new Logger()
  ) {
    this.Identity = {
      ...Identity.AuthApiFactory(configuration),
      ...Identity.RolesApiFactory(configuration),
      ...Identity.UsersApiFactory(configuration),
      ...Identity.ProjectsApiFactory(configuration),
      ...Identity.DomainsApiFactory(configuration),
      ...Identity.ServicesApiFactory(configuration),
      ...Identity.EndpointsApiFactory(configuration),
      ...Identity.GroupsApiFactory(configuration),
    };
    this.configuration = configuration;
    this.Compute = {
      ...Compute.ExtensionsApiFactory(configuration),
      ...Compute.OsSimpleTenantUsageApiFactory(configuration),
      ...Compute.ServersApiFactory(configuration),
      ...Compute.FlavorsApiFactory(configuration),
      ...Compute.ImagesApiFactory(configuration),
      ...Compute.OsKeypairsApiFactory(configuration),
    };
    this.Network = {
      ...Network.NetworksApiFactory(configuration),
      ...Network.SubnetsApiFactory(configuration),
      ...Network.PortsApiFactory(configuration),
      ...Network.SecurityGroupsApiFactory(configuration),
      ...Network.SecurityGroupRulesApiFactory(configuration),
      ...Network.FloatingipPoolsApiFactory(configuration),
    };
  }

  public async authenticate(
    credentials: Identity.AuthTokensPostRequest = this._auth,
    retryOnError = true,
    retryInterval = 60 * 1000,
    timeout = 1000
  ): Promise<Identity.AuthTokensPostResponse | void> {
    if (
      this.expires_at &&
      !(this.expires_at.getTime() < new Date().getTime())
    ) {
      this.logger.log("Token is still valid - doing nothing");
      return void 0;
    }
    try {
      const authResponse = await this.Identity.authTokensPost(credentials, {
        timeout // fail fast and retry instead
      });
      const token = authResponse.headers["x-subject-token"];
      this._token = token;
      const catalog = authResponse.data.token?.catalog;
      if (!catalog) {
        this.logger.error("No catalog found in response");
        throw new Error("No catalog found in response");
      }
      if (authResponse.data.token?.expires_at) {
        this.logger.log(
          "Token expires at: ",
          authResponse.data.token.expires_at
        );
        this.expires_at = new Date(authResponse.data.token.expires_at);
      }
      if (authResponse.data.token?.expires_at === null) {
        // null means token never expires
        this.expires_at = new Date(
          new Date().setFullYear(new Date().getFullYear() + 100)
        );
      }
      this._catalog = catalog;
      this.initializeApis(catalog);
      if (this.expires_at) {
        const now = new Date();
        const timeUntilExpiration = this.expires_at.getTime() - now.getTime();
        const rescheduleTime = timeUntilExpiration - 5 * 60 * 1000; // 5 minutes before expiration

        if (rescheduleTime > 0) {
            const rescheduleTimeInSeconds = Math.floor(rescheduleTime / 1000);
            const hours = Math.floor(rescheduleTimeInSeconds / 3600);
            const minutes = Math.floor((rescheduleTimeInSeconds % 3600) / 60);
            const seconds = rescheduleTimeInSeconds % 60;

            this.logger.log(
            "Rescheduling authentication in ",
            `${hours}h ${minutes}m ${seconds}s`
            );
          setTimeout(() => {
            this.logger.log("Re-authenticating");
            this.authenticate(credentials).catch((error) => {
              this.logger.error("Failed to re-authenticate after token expired:", error.message);
            });
          }, rescheduleTime);
        }
      }
      return authResponse.data;
    } catch (e: any) {
      this.logger.error("Failed to authenticate:", e.message);
      if (retryOnError) {
        this.logger.log(`Retrying in ${retryInterval}ms`);
        if (this._retry) {
          clearTimeout(this._retry);
          this._retry = undefined;
        }
        this._retry = setTimeout(() => {
          this.logger.log("Retrying authentication");
          this.authenticate(credentials, retryOnError, retryInterval, timeout).catch((error) => {
            this.logger.error("Failed to re-authenticate after Error:", e.message);
          });
        }, retryInterval); // Retry in 1 minute
      }
      throw e;
    }
  }

  public switchEndpointInterface(interfaceName: string) {
    if (!this._catalog) {
      this.logger.error("No catalog found in response");
      throw new Error("No catalog found in response");
    }
    this.initializeApis(this._catalog, interfaceName);
  }

  private initializeApis(
    catalog: Identity.AuthCatalogGetResponseCatalogInner[],
    entrypointInterface: string = "public"
  ) {
    this.initializeApi("compute", catalog, entrypointInterface);
    this.initializeApi("network", catalog, entrypointInterface);
    this.initializeApi("identity", catalog, entrypointInterface);
  }

  private initializeApi(
    type: string,
    catalog: Identity.AuthCatalogGetResponseCatalogInner[],
    entrypointInterface: string = "public"
  ) {
    const service = catalog.find((entry) => entry.type === type);
    if (!service || !service.endpoints) {
      this.logger.error(`No  ${type} service found in catalog`);
      throw new Error(`No  ${type} service found in catalog`);
    }
    const endpoint = service.endpoints.find(
      (endpoint) => endpoint.interface === entrypointInterface
    );
    if (!endpoint || !endpoint.url) {
      this.logger.error(
        `No ${entrypointInterface} endpoint found in ${type} service`
      );
      throw new Error(
        `No ${entrypointInterface} endpoint found in compute service`
      );
    }
    const parsedUrl = new URL(endpoint.url);
    const config = new Identity.Configuration({
      ...this.configuration,
    });

    config.basePath = `${parsedUrl.protocol}//${parsedUrl.host}`;
    config.baseOptions.headers["X-Auth-Token"] = this._token;

    if (type === "compute") {
      this.Compute = {
        ...Compute.ExtensionsApiFactory(config),
        ...Compute.OsSimpleTenantUsageApiFactory(config),
        ...Compute.ServersApiFactory(config),
        ...Compute.FlavorsApiFactory(config),
        ...Compute.ImagesApiFactory(config),
        ...Compute.OsKeypairsApiFactory(config),
      };
    }

    if (type === "network") {
      this.Network = {
        ...Network.NetworksApiFactory(config),
        ...Network.SubnetsApiFactory(config),
        ...Network.PortsApiFactory(config),
        ...Network.SecurityGroupsApiFactory(config),
        ...Network.SecurityGroupRulesApiFactory(config),
        ...Network.FloatingipPoolsApiFactory(config),
      };
    }
    if (type === "identity") {
      this.Identity = {
        ...Identity.AuthApiFactory(config),
        ...Identity.RolesApiFactory(config),
        ...Identity.UsersApiFactory(config),
        ...Identity.ProjectsApiFactory(config),
        ...Identity.DomainsApiFactory(config),
        ...Identity.ServicesApiFactory(config),
        ...Identity.EndpointsApiFactory(config),
        ...Identity.GroupsApiFactory(config),
      };
    }
  }
}

export { Compute, Network, Identity };

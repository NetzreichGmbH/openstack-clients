import * as Compute from "./compute";
import * as Network from "./network";
import * as Identity from "./identity";
import { BaseAPI } from "./identity/base";

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

  constructor(configuration: Identity.Configuration) {
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


  public authenticate(credentials: Identity.AuthTokensPostRequest): Promise<void> {
    return this.Identity.authTokensPost(credentials).then((res) => {
      const token = res.headers['x-subject-token'];
      this._token = token;
      const catalog = res.data.token?.catalog;
      if (!catalog) {
        throw new Error("No catalog found in response");
      }
      this._catalog = catalog;
      this.initializeApis(catalog);
    });
  }

  public switchEndpointInterface(interfaceName: string) {
    if (!this._catalog) {
      throw new Error("No catalog found in response");
    }
    this.initializeApis(this._catalog, interfaceName);
  }

  private initializeApis(catalog: Identity.AuthCatalogGetResponseCatalogInner[], entrypointInterface: string = "public") {
    this.initializeApi("compute", catalog, entrypointInterface);
    this.initializeApi("network", catalog, entrypointInterface);
    this.initializeApi("identity", catalog, entrypointInterface);
  }

  private initializeApi(type: string,  catalog: Identity.AuthCatalogGetResponseCatalogInner[], entrypointInterface: string = "public") {

    const service = catalog.find((entry) => entry.type === type);
    if (!service || !service.endpoints) {
      throw new Error(`No  ${type} service found in catalog`);
    }
    const endpoint = service.endpoints.find((endpoint) => endpoint.interface === entrypointInterface);
    if (!endpoint || !endpoint.url) {
      throw new Error(`No ${entrypointInterface} endpoint found in compute service`);
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

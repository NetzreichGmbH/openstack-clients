# OpenStack Clients

This package offers typed OpenStack Clients based on OpenAPI Specs generated by using the official OpenStack projects openapi spec exports.

## Installation

To install the OpenStack Clients package, follow these steps:

Install via npm/yarn

```bash
npm i @netzreich/openstack-clients
```

```bash
yarn add @netzreich/openstack-clients
```

## Supported APIs

### Identity

 - Auth
 - Roles
 - Users
 - Groups
 - Projects
 - Domains
 - Services
 - Endpoints

### Compute

 - Extensions
 - OsSimpleTenantUsage
 - Servers
 - Flavours
 - Images
 - OsKeypairs

# Network

 - Networks
 - Subnets
 - Ports
 - SecurityGroups
 - SecurityGroupsRules
 - FloatingipPool

Missing an API? More APIs are available but not yet boostrapt in the Client. 

## Usage

To use the OpenStack Clients package, you can import the desired client module and start making API calls. Here's an example:
For most API endpoints you have to authenticate via username/password or application credentials using the `authenticate` method.
Authentication will load the current service-catalog and apply the endpoints to the different clients via service discovery. Only the Keystone has to be configured in the initial config. 


Import as ES Module
```javascript
import OpenStack, { Identity } from "@netzreich/openstack-clients";
import { AxiosError, AxiosResponse } from "axios";
import * as util from "util";

const config = new Identity.Configuration({
  basePath: "{{KEYSTONE_URL}}",

  baseOptions: {
    headers: {
      "Content-Type": "application/json",
    },
  },
});

const client = new OpenStack(config);
client
  .authenticate({
    auth: {
      identity: {
        methods: ["password"],
        password: {
          user: {
            name: "{{USERNAME}}",
            domain: { name: "{{DOMAINNAME}}" },
            password: "{{PASSWORD}}",
          },
        },
      },
      scope: {
        project: {
          id: "{{PROJECT_ID}}",
          domain: { name: "{{DOMAINNAME}}" },
        },
      },
    },
  })
  .then(() => {
    console.log("Authenticated")

    client.Network.networksGet()
      .then((res: AxiosResponse) => {
        console.log(res.data);
      })
      .catch((err: AxiosError) => {
       console.error(`Failed to get servers: ${err.message}`);
      });
  })
  .catch((err) => {
    console.error(`Authentication failed: ${err.message}`);
  });
```

## You are in need of an OpenCloud under EU law?

This package was developed and tested on the [TelemaxX OpenCloud](https://www.telemaxx.de/services/cloud) (based on OpenStack)

## Contributing

This package is developed on github: https://github.com/NetzreichGmbH/openstack-clients. You can report issues and make pull-requests.

## License

This project is licensed under the MIT License. See the LICENSE file for more information.

## Get Support

As experts in digital solutions, [netzreich](https://www.netzreich.de) supports you in the implementation and management of OpenStack services. Our experienced team offers comprehensive consulting and tailored solutions for cloud computing and OpenStack architectures. Whether it's API integration, cloud infrastructure, or specific applications – we help you future-proof your IT infrastructure. Contact us for professional advice and customized solutions.

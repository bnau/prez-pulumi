import * as kubernetes from "@pulumi/kubernetes";
import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import {Stack, dbUser, dbPassword, dbName} from "./common";
import {ComponentResource, Lifted, Output, OutputInstance} from "@pulumi/pulumi";
import * as path from "node:path";

type K8sApplicationArgs = {
    webServerNs: kubernetes.core.v1.Namespace;
    dbHost: Output<string>;
}

class K8sApplication extends ComponentResource {
    url: Output<string>;

    constructor(name: string, args: K8sApplicationArgs, opts?: pulumi.ComponentResourceOptions) {
        super("my-app:local:K8sApplication", name, {}, opts);
        const appLabels = {
            app: "nginx",
        };
        const image = new docker.Image("my-image", {
            build: {
                context: path.join(__dirname, "backend"),
            },
            imageName: "pulumi-demo",
            skipPush: true,
        }, {parent: this});

        const deployment = new kubernetes.apps.v1.Deployment("webserverdeployment", {
            metadata: {
                namespace: args.webServerNs.metadata.name,
            },
            spec: {
                selector: {
                    matchLabels: appLabels,
                },
                replicas: 1,
                template: {
                    metadata: {
                        labels: appLabels,
                    },
                    spec: {
                        containers: [{
                            image: image.imageName,
                            name: "pulumi-demo",
                            imagePullPolicy: "Never",
                            env: [
                                {
                                    name: "DB_USER",
                                    value: dbUser,
                                },
                                {
                                    name: "DB_PASSWORD",
                                    value: dbPassword,
                                },
                                {
                                    name: "DB_HOST",
                                    value: args.dbHost,
                                },
                                {
                                    name: "DB_NAME",
                                    value: dbName,
                                },
                            ],
                        }],
                    },
                },
            },
        }, {parent: this});

        const service = new kubernetes.core.v1.Service("webserverservice", {
            metadata: {
                namespace: args.webServerNs.metadata.name,
            },
            spec: {
                ports: [{
                    port: 80,
                    targetPort: 8080,
                    protocol: "TCP",
                }],
                type: "LoadBalancer",
                selector: appLabels,
            },
        }, {dependsOn: [deployment], parent: this});

        this.url = pulumi.all([service.status, service.spec])
            .apply(([status, spec]) =>
                `http://${status.loadBalancer.ingress[0].hostname}:${spec.ports[0].port}`)

        this.registerOutputs({
            url: this.url,
        });
    }
}

type HelmDatabaseArgs = {
    k8sNamespace: string;
    webServerNs: kubernetes.core.v1.Namespace;
}

class HelmDatabase extends ComponentResource {
    host: Output<string>;

    constructor(name: string, args: HelmDatabaseArgs, opts?: pulumi.ComponentResourceOptions) {
        super("my-app:local:HelmDatabase", name, {}, opts);
        const pgChart = new kubernetes.helm.v3.Chart("postgres", {
            namespace: args.k8sNamespace,
            chart: "postgresql",
            fetchOpts: {
                repo: "https://charts.bitnami.com/bitnami",
            },
            values: {
                auth: {
                    username: dbUser,
                    password: dbPassword,
                    postgresPassword: dbPassword,
                    database: dbName,
                }

            },
        }, {dependsOn: args.webServerNs, parent: this});

        this.host = pgChart.getResourceProperty("v1/Service", `${args.k8sNamespace}/postgres-postgresql`, "metadata").name;

        this.registerOutputs({
            host: this.host,
        });
    }

}

const config = new pulumi.Config();
const k8sNamespace = config.get("namespace") || "default";

const webServerNs = new kubernetes.core.v1.Namespace("webserver", {
    metadata: {
        name: k8sNamespace,
    }
});

export class LocalStack extends Stack {
    constructor(name: string) {
        super("my-app:local:Stack", name);
    }

    application(dbHost: OutputInstance<string> & Lifted<string>): Output<string> {
        return new K8sApplication("my-app", {
            webServerNs,
            dbHost,
        }, {parent: this}).url;
    }

    database(): Output<string> {
        return new HelmDatabase("my-db", {
            k8sNamespace,
            webServerNs,
        }, {parent: this}).host;
    }
}
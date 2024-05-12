import {ComponentResource, Output} from "@pulumi/pulumi";
import * as pulumi from "@pulumi/pulumi";

export const dbUser = new pulumi.Config().get("dbUser");
export const dbPassword = new pulumi.Config().getSecret("dbPassword");
export const dbName = "demo"

export abstract class Stack extends ComponentResource {
    abstract database(): Output<string>;

    abstract application(dbHost: Output<string>): Output<string>;

    constructor(type: string, name: string) {
        super(type, name);
    }

    build(): Output<string> {
        const dbHost = this.database();
        return this.application(dbHost);
    }
}

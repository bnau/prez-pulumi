import {Output} from "@pulumi/pulumi";

export const dbUser = "demo";
export const dbPassword = "my-password";
export const dbName = "demo"

export abstract class Stack {
    abstract database(): Output<string>;

    abstract application(dbHost: string): Output<string>;

    init(): Output<string> {
        return this.database()
            .apply(this.application.bind(this))
    }
}

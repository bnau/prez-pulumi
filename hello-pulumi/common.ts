import {Output} from "@pulumi/pulumi";

export type Outs= {
    url: string;
}

export abstract class Stack {
    abstract database(): Output<string>;
    abstract application(dbHost: string): Output<Outs>;

    init(): Output<Outs> {
        return this.database()
            .apply(this.application.bind(this))
    }
}

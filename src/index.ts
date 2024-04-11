import * as pulumi from "@pulumi/pulumi";
import {LocalStack} from "./local";
import {Stack} from "./common";

// Get some values from the stack configuration, or use defaults
const config = new pulumi.Config();

let stack: Stack;
if (config.get("env") === "local") {
    stack = new LocalStack(config);
} else {
    throw new Error(`Unknown stack: ${pulumi.getStack()}`);
}

const outputs = stack.init();

export const url = outputs.url;

#!/usr/bin/env node
import { createCli } from "./cli.js";

const argv = process.argv[2] === "--"
  ? [process.argv[0] ?? "node", process.argv[1] ?? "tokenvalve", ...process.argv.slice(3)]
  : process.argv;

await createCli().parseAsync(argv);

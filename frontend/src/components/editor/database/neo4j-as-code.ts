/* Copyright 2026 Marimo. All rights reserved. */

import dedent from "string-dedent";
import { isSecret, unprefixSecret } from "./secrets";

export interface Neo4jConnection {
  type: "neo4j";
  uri: string;
  username: string;
  password?: string;
  database?: string;
}

interface EnvVar {
  varName: string;
  getter: string;
}

function resolveValue(
  varName: string,
  value: string | undefined,
  envKey: string,
  defaultValue?: string,
): { envVar?: EnvVar; ref: string } {
  if (!value) {
    const getter = defaultValue
      ? `os.environ.get("${envKey}", "${defaultValue}")`
      : `os.environ.get("${envKey}")`;
    return { envVar: { varName: `_${varName}`, getter }, ref: `_${varName}` };
  }
  if (isSecret(value)) {
    const key = unprefixSecret(value as Parameters<typeof unprefixSecret>[0]);
    const getter = `os.environ.get("${key}")`;
    return { envVar: { varName: `_${varName}`, getter }, ref: `_${varName}` };
  }
  return { ref: `"${value}"` };
}

export function generateNeo4jCode(connection: Neo4jConnection): string {
  const { envVar: uriVar, ref: uriRef } = resolveValue(
    "uri",
    connection.uri,
    "NEO4J_URI",
  );
  const { envVar: userVar, ref: userRef } = resolveValue(
    "username",
    connection.username,
    "NEO4J_USERNAME",
  );
  const { envVar: pwVar, ref: pwRef } = resolveValue(
    "password",
    connection.password,
    "NEO4J_PASSWORD",
  );

  const envVars = [uriVar, userVar, pwVar].filter(
    (v): v is EnvVar => v !== undefined,
  );

  const importLines = ["import neo4j"];
  if (envVars.length > 0) {
    importLines.push("import os");
  }

  const envLines = envVars.map((v) => `${v.varName} = ${v.getter}`);

  const databaseArg =
    connection.database ? `, database="${connection.database}"` : "";

  const connectionCode = dedent(`
    driver = neo4j.GraphDatabase.driver(${uriRef}, auth=(${userRef}, ${pwRef})${databaseArg})
  `).trim();

  const lines = [...importLines];
  if (envLines.length > 0) {
    lines.push("", ...envLines);
  }
  lines.push("", connectionCode);

  return lines.join("\n");
}

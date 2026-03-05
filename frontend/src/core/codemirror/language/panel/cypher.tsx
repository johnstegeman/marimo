/* Copyright 2026 Marimo. All rights reserved. */

import type { SelectTriggerProps } from "@radix-ui/react-select";
import { useAtomValue } from "jotai";
import { AlertCircle } from "lucide-react";
import { getCellForDomProps } from "@/components/data-table/cell-utils";
import { transformDisplayName } from "@/components/databases/display";
import { DatabaseLogo } from "@/components/databases/icon";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CypherOutputType } from "@marimo-team/smart-cells";
import type { CellId } from "@/core/cells/ids";
import { dataConnectionsMapAtom } from "@/core/datasets/data-source-connections";
import type { ConnectionName } from "@/core/datasets/engines";
import { useNonce } from "@/hooks/useNonce";

interface CypherEngineSelectProps {
  selectedEngine: string;
  onChange: (engine: string) => void;
  cellId: CellId;
}

export const CypherEngineSelect: React.FC<CypherEngineSelectProps> = ({
  selectedEngine,
  onChange,
  cellId,
}) => {
  const connectionsMap = useAtomValue(dataConnectionsMapAtom);
  const rerender = useNonce();

  // Only show neo4j connections
  const neo4jConnections = [...connectionsMap.values()].filter(
    (conn) => conn.source === "neo4j",
  );

  const engineIsDisconnected =
    selectedEngine && !connectionsMap.has(selectedEngine as ConnectionName);

  const handleSelectEngine = (value: string) => {
    const nextEngine = connectionsMap.get(value as ConnectionName);
    if (nextEngine) {
      rerender();
      onChange(nextEngine.name);
    }
  };

  return (
    <Select value={selectedEngine} onValueChange={handleSelectEngine}>
      <CypherSelectTrigger {...getCellForDomProps(cellId)}>
        <SelectValue placeholder="Select a Neo4j connection" />
      </CypherSelectTrigger>
      <SelectContent {...getCellForDomProps(cellId)}>
        <SelectGroup>
          <SelectLabel>Neo4j connections</SelectLabel>
          {engineIsDisconnected && (
            <SelectItem key={selectedEngine} value={selectedEngine}>
              <div className="flex items-center gap-1 opacity-50">
                <AlertCircle className="h-3 w-3" />
                <span className="truncate">
                  {transformDisplayName(selectedEngine)}
                </span>
              </div>
            </SelectItem>
          )}
          {neo4jConnections.map((connection) => (
            <SelectItem key={connection.name} value={connection.name}>
              <div className="flex items-center gap-1">
                <DatabaseLogo className="h-3 w-3" name={connection.source} />
                <span className="truncate ml-0.5">
                  {transformDisplayName(connection.display_name)}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

const CypherSelectTrigger: React.FC<SelectTriggerProps> = ({
  children,
  ...props
}) => {
  return (
    <SelectTrigger
      className="text-xs border-border shadow-none! ring-0! h-5 px-1.5 hover:bg-accent transition-colors"
      {...props}
    >
      {children}
    </SelectTrigger>
  );
};

interface CypherOutputTypeSelectProps {
  outputType: CypherOutputType;
  onChange: (outputType: CypherOutputType) => void;
  cellId: CellId;
}

export const CypherOutputTypeSelect: React.FC<CypherOutputTypeSelectProps> = ({
  outputType,
  onChange,
  cellId,
}) => {
  return (
    <Select
      value={outputType}
      onValueChange={(value) => onChange(value as CypherOutputType)}
    >
      <CypherSelectTrigger {...getCellForDomProps(cellId)}>
        <SelectValue />
      </CypherSelectTrigger>
      <SelectContent {...getCellForDomProps(cellId)}>
        <SelectGroup>
          <SelectLabel>Output type</SelectLabel>
          <SelectItem value="dataframe">Dataframe</SelectItem>
          <SelectItem value="visualization">Visualization</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

#!/usr/bin/env -S node --loader ts-node/esm

import "zx/globals";
import { traverse } from "object-traversal";

$.verbose = false;

const GRAFANA_URL = "https://o11y.aptosdev.com";

let dashboardFilePaths = await glob(["dashboards/*.json"]);

const commonTemplateVariables = [
  {
    name: "metrics_source",
    type: "query",
    datasource: null,
    refresh: 1,
    options: [],
    includeAll: true,
    allFormat: "",
    allValue: ".*",
    multi: false,
    multiFormat: "",
    query: {
      query: "label_values(node_process_start_time{}, metrics_source)",
      refId: "StandardVariableQuery",
    },
    regex: "",
    current: { text: ["All"], value: "$__all" },
    label: "",
    hide: 0,
    sort: 0,
  },
  {
    name: "chain_name",
    type: "query",
    datasource: { type: "prometheus", uid: "${Datasource}" },
    refresh: 1,
    options: [],
    includeAll: false,
    allFormat: "",
    allValue: "",
    multi: false,
    multiFormat: "",
    query: {
      query: 'label_values(node_process_start_time{metrics_source=~"$metrics_source"}, chain_name)',
      refId: "StandardVariableQuery",
    },
    regex: "",
    current: { text: ["3"], value: "3" },
    label: "",
    hide: 0,
    sort: 1,
  },
  {
    name: "cluster",
    type: "query",
    datasource: null,
    refresh: 1,
    options: [],
    includeAll: true,
    allFormat: "",
    allValue: ".*",
    multi: false,
    multiFormat: "",
    query: {
      query:
        'label_values(node_process_start_time{metrics_source=~"$metrics_source", chain_name=~"$chain_name"}, cluster)',
      refId: "StandardVariableQuery",
    },
    regex: "",
    current: { text: ["All"], value: "$__all" },
    label: "",
    hide: 0,
    sort: 0,
  },
  {
    name: "namespace",
    type: "query",
    datasource: { type: "prometheus", uid: "${Datasource}" },
    refresh: 1,
    options: [],
    includeAll: true,
    allFormat: "",
    allValue: ".*",
    multi: false,
    multiFormat: "",
    query: {
      query:
        'label_values(node_process_start_time{metrics_source=~"$metrics_source", chain_name=~"$chain_name", cluster=~"$cluster"}, namespace)',
      refId: "StandardVariableQuery",
    },
    regex: "",
    current: { text: ["All"], value: "$__all" },
    label: "",
    hide: 0,
    sort: 1,
  },
  {
    name: "kubernetes_pod_name",
    type: "query",
    datasource: { type: "prometheus", uid: "${Datasource}" },
    refresh: 1,
    options: [],
    includeAll: true,
    allFormat: "",
    allValue: ".*",
    multi: true,
    multiFormat: "",
    query: {
      query:
        'label_values(node_process_start_time{metrics_source=~"$metrics_source", chain_name=~"$chain_name", cluster=~"$cluster", namespace=~"$namespace"}, kubernetes_pod_name)',
      refId: "StandardVariableQuery",
    },
    regex: "",
    current: { text: ["All"], value: ["$__all"] },
    label: "",
    hide: 0,
    sort: 1,
  },
];

const variableNamesToUpsert = commonTemplateVariables.map((v) => v.name);

const templateVariablesOfInterest = ["chain_name", "namespace", "kubernetes_pod_name"];
// dashboardFilePaths = dashboardFilePaths.filter((dashboardFilePath) => !dashboardsToExclude.includes(dashboardFilePath));

for (const [filePath, dashboard] of await readDashboards()) {
  traverse(dashboard, insertCluster);
  traverse(dashboard, insertMetricsSource);

  const originalTemplateVariables = dashboard.templating.list;
  const originalTemplateVariablesToKeep = originalTemplateVariables
    .slice(1)
    .filter((variable) => !variableNamesToUpsert.includes(variable.name));

  const datasourceVariable = originalTemplateVariables[0];

  datasourceVariable.current = { text: ["VictoriaMetrics Mainnet US"], value: "VictoriaMetrics Mainnet US" };

  dashboard.templating.list = [
    originalTemplateVariables[0],
    ...commonTemplateVariables,
    ...originalTemplateVariablesToKeep,
  ];
  await fs.writeJson(filePath, dashboard);
}

await $`prettier --write dashboards/*.json`;
await $`gzip -fkn ${"dashboards"}/*.json`;

// const dashboardsWithoutChainName = parsedDashboards.filter(
//   ([filePath, dashboard]) => !hasAllTemplateVariables(dashboard),
// );

// for (const [filePath, dashboard] of await readDashboards()) {
//   // if (filePath === "dashboards/api.json") {
//   console.log("uploading:", filePath);
//   await upsertDashboard(dashboard);
//   // }
// }

// REUSE FUNCTIONS

async function readDashboards() {
  return await Promise.all(dashboardFilePaths.map(async (filePath) => [filePath, await fs.readJson(filePath)]));
}

function hasAllTemplateVariables(dashboard) {
  return templateVariablesOfInterest.every((variable) => getTemplateVariables(dashboard).includes(variable));
}

function getTemplateVariables(dashboard) {
  return dashboard.templating.list?.map((template) => template.name) || [];
}

function insertMetricsSource({ parent, key, value, meta }) {
  if (typeof value === "string" && key === "expr") {
    parent[key] = value.replaceAll(
      `namespace=~\"$namespace\"`,
      `metrics_source=~\"$metrics_source\", namespace=~\"$namespace\"`,
    );
  }
}

function insertCluster({ parent, key, value, meta }) {
  if (typeof value === "string" && key === "expr") {
    parent[key] = value.replaceAll(`chain_name=~\"$chain_name\"`, `chain_name=~\"$chain_name\", cluster=~\"$cluster\"`);
  }
}

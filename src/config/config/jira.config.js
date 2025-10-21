const JIRA_CONFIG = {
  baseUrl: process.env.JIRA_BASE_URL,
  auth: {
    username: process.env.JIRA_EMAIL,
    password: process.env.JIRA_API_TOKEN,
  },
  projectKey: process.env.JIRA_PROJECT_KEY,
  customFields: {
    environment: "customfield_10010",
    endpoint: "customfield_10011",
    httpMethod: "customfield_10012",
  },
  priorityMap: {
    critical: "Highest",
    high: "High",
    medium: "Medium",
    low: "Low",
  },
};

module.exports = { JIRA_CONFIG };

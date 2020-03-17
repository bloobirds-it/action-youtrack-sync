const core = require("@actions/core");
const github = require("@actions/github");
const axios = require("axios");

const GITHUB_TOKEN = core.getInput("githubToken");
const YT_TOKEN = core.getInput("youtrackToken");
const YT_URL = core.getInput("youtrackUrl");
const YT_LABEL_PREFIX = core.getInput("youtrackLabelPrefix");
const YT_COLUMN_FIELD = core.getInput("youtrackColumnField");
const YT_PROJECT_ID = core.getInput("youtrackProjectId");
const YT_LABELS = core
  .getInput("youtrackLabelFields")
  .split(",")
  .map(x => x.trim().toLowerCase());

const YT_COLUMN_TRIGGERS = core
  .getInput("youtrackColumnTriggers")
  .split(",")
  .map(x => x.trim().toLowerCase());

const YT_COLUMN_TARGET = core.getInput("youtrackColumnTarget");

const YT_ISSUE = "api/issues/";
const REPO_URL = `https://github.com/${github.context.issue.owner}/${github.context.issue.repo}`;
const PR_URL = `https://github.com/${github.context.issue.owner}/${github.context.issue.repo}/pull/${github.context.issue.number}`;
const ISSUE_REGEX = new RegExp(`${YT_PROJECT_ID}-[0-9]+`, "g");

const ytApi = axios.create({
  headers: {
    authorization: `Bearer ${YT_TOKEN}`,
    accept: "application/json",
    "cache-control": "no-cache",
    "content-type": "application/json"
  },
  baseURL: YT_URL + (YT_URL.endsWith("/") ? "" : "/") + YT_ISSUE
});

const octokit = new github.GitHub(GITHUB_TOKEN);

async function run() {
  try {
    const tickets = await getMatchingTickets();

    if (tickets.length === 0) {
      console.log("PR description does not contain any issue ID.");
      return;
    }

    console.log(`Found issues: ${tickets.join(", ")}.`);

    tickets.forEach(async issueId => {
      // Skip if ticket does not exist
      if (!(await checkIssueExist(issueId))) return;

      const fields = await getFields(issueId);
      const state = fields.find(x => x.name === YT_COLUMN_FIELD);
      const value = state.value && state.value.name.toLowerCase();

      console.log(`Found ${fields.length} for issue ${issueId}`);

      // Skip if ticket it not in the column triggers.
      if (!YT_COLUMN_TRIGGERS.some(x => x == value)) return;

      await commentYT(
        issueId,
        `New PR [#${github.context.issue.number}](${PR_URL}) opened at [${github.context.issue.owner}/${github.context.issue.repo}](${REPO_URL}) by ${github.context.actor}.`
      );

      await moveIssueTarget(issueId, state.id);

      await commentPR(
        `Issue [${issueId}](${getIssueLink(issueId)}) changed from *${
          state.value.name
        }* to *${YT_COLUMN_TARGET}*`
      );

      await updatePR(issueId);

      YT_LABELS.forEach(label => {
        const type = fields.find(x => x.name.toLowerCase() === label);

        if (type && type.value && type.name && type.value.name) {
          const value = type.value.name.toLowerCase();
          const name = type.name.toLowerCase();

          console.log(`Label PR with ${value} from ticket ${issueId}`);
          labelPR([`${YT_LABEL_PREFIX}${name}/${value}`]);
        }
      });
    });
    // await commentPR(
    //   `Linked PR to issues:\n${tickets
    //     .map(id => `- [${id}](${getIssueLink(id)})`)
    //     .join("\n")}`
    // );
  } catch (error) {
    if (error.message !== `(s || "").replace is not a function`) {
      console.log(error.stack);
      core.setFailed(error.message);
    }
  }
}

async function moveIssueTarget(issueId, stateId) {
  const response = await ytApi.post(
    `${issueId}/fields/${stateId}?fields=name,id,value(name)`,
    {
      value: {
        name: YT_COLUMN_TARGET
      }
    }
  );

  console.log(`Changed ${issueId} to PR Open. (Status: ${response.status})`);

  return response;
}

async function labelPR(labels) {
  await octokit.issues.addLabels({
    owner: github.context.issue.owner,
    repo: github.context.issue.repo,
    issue_number: github.context.issue.number,
    labels
  });
}

async function getPrDescription() {
  const { data } = await octokit.pulls.get({
    owner: github.context.issue.owner,
    repo: github.context.issue.repo,
    pull_number: github.context.issue.number
  });

  return data.body;
}

async function getMatchingTickets() {
  console.log(`Checking ${ISSUE_REGEX} against the PR description`);

  const description = await getPrDescription();
  const matches = [...description.matchAll(ISSUE_REGEX)];

  return matches.map(x => x[0]);
}

async function checkIssueExist(issueId) {
  const response = await ytApi.get(`${issueId}`);

  if (response.status === 404) {
    console.log(`Issue ${issueId} not found in your YouTrack instance.`);
    return false;
  } else if (response.statusText !== "OK") {
    console.log(`Unknown error connecting to YouTrack ${response.status}`);
    return false;
  }

  return true;
}

async function commentPR(body) {
  await octokit.issues.createComment({
    owner: github.context.issue.owner,
    repo: github.context.issue.repo,
    issue_number: github.context.issue.number,
    body
  });
}

async function commentYT(issueId, text) {
  const response = await ytApi.post(`${issueId}/comments`, {
    text,
    usesMarkdown: true
  });

  console.log(
    `Commented YT for issue ${issueId}. (Status: ${response.status})`
  );

  return response;
}

async function updatePR(issueId) {
  const description = await getPrDescription();

  const regex = new RegExp(issueId, "g");
  const body = description.replace(
    regex,
    ticket => `[${ticket}](${YT_URL}${ticket})`
  );

  await octokit.pulls.update({
    owner: github.context.issue.owner,
    repo: github.context.issue.repo,
    pull_number: github.context.issue.number,
    body
  });

  console.log(`Updated PR for issue ${issueId}`);
}

async function getFields(issueId) {
  const response = await ytApi.get(
    `${issueId}/fields?fields=name,id,value(name)`
  );

  return response.data;
}

function getIssueLink(id) {
  return `${YT_URL}issue/${id}`;
}

run();

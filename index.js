const core = require("@actions/core");
const github = require("@actions/github");
const axios = require("axios");

const GITHUB_TOKEN = core.getInput("githubToken");
const YT_TOKEN = core.getInput("youtrackToken");
const YT_URL = core.getInput("youtrackUrl");
const YT_LABEL_PREFIX = core.getInput("youtrackLabelPrefix");
const YT_COLUMN = core.getInput("youtrackColumnField");
const YT_PROJECT_ID = core.getInput("youtrackProjectID", { required: true });
const YT_LABELS = core
  .getInput("youtrackLabelFields")
  .split(",")
  .map(x => x.trim());

const YT_COLUMN_TRIGGERS = core
  .getInput("youtrackColumnTriggers")
  .split(",")
  .map(x => x.trim());

const YT_COLUMN_TARGET = core.getInput("youtrackColumnTarget");

const YT_ISSUE = "api/issues/";
const REPO_URL = `https://github.com/${github.context.issue.owner}/${github.context.issue.repo}`;
const PR_URL = `https://github.com/${github.context.issue.owner}/${github.context.issue.repo}/pull/${github.context.issue.number}`;
const ISSUE_REGEX = new RegExp(`${YT_PROJECT_ID}-[0-9]+'`, "g");

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
      throw "PR description does not contain any issue ID.";
    }

    console.log(`Found issues: ${tickets.join(", ")}.`);

    tickets.forEach(async id => await checkIssueExist(id));

    await commentPR(
      `Linked PR to issues:\n${tickets
        .map(id => `- [${id}](${getIssueLink(id)})`)
        .join("\n")}`
    );

    console.log("Commented PR with linked issues.");

    tickets.forEach(async issueId => {
      await commentYT(
        issueId,
        `New PR [#${github.context.issue.number}](${PR_URL}) opened at [${github.context.issue.owner}/${github.context.issue.repo}](${REPO_URL}) by ${github.context.actor}.`
      );
    });

    console.log(`Commented YT issues with the according PR.`);

    await updatePR();

    console.log("Updated PR description with YT links.");

    tickets.forEach(async issueId => {
      const fields = await getFields(issueId);

      const state = fields.find(x => x.name === YT_COLUMN);
      const value = state.value.name.toLowerCase();

      if (YT_COLUMN_TRIGGERS.some(x => x == value)) {
        const response = await moveIssueTarget(issueId, state.id);

        console.log(`Changed issue to PR Open with status: ${response.status}`);

        await commentPR(
          `Issue [${issueId}](${getIssueLink(issueId)}) changed from *${
            state.value.name
          }* to *${YT_COLUMN_TARGET}*`
        );
      }

      YT_LABELS.forEach(label => {
        const type = fields.find(x => x.name === label);

        if (type.value.name) {
          const value = type.value.name.toLowerCase();

          console.log(`Label PR with ${value}`);
          labelPR([`${YT_LABEL_PREFIX}${value.toLowerCase()}`]);
        }
      });
    });

    core.setOutput("issues", tickets);
  } catch (error) {
    if (error.message !== `(s || "").replace is not a function`) {
      console.log(error.stack);
      core.setFailed(error.message);
    }
  }
}

async function moveIssueTarget(issueId, stateId) {
  return await ytApi.post(
    `${issueId}/fields/${stateId}?fields=name,id,value(name)`,
    {
      value: {
        name: YT_COLUMN_TARGET
      }
    }
  );
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
    throw new Error(`Issue ${issueId} not found in your YouTrack instance.`);
  } else if (response.statusText !== "OK") {
    throw new Error(`Unknown error connecting to YouTrack ${response.status}`);
  }
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
  await ytApi.post(`${issueId}/comments`, {
    text,
    usesMarkdown: true
  });
}

async function updatePR() {
  const description = await getPrDescription();
  const body = description.replace(
    ISSUE_REGEX,
    ticket => `[${ticket}](${YT_URL}${ticket})`
  );

  await octokit.pulls.update({
    owner: github.context.issue.owner,
    repo: github.context.issue.repo,
    pull_number: github.context.issue.number,
    body
  });
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

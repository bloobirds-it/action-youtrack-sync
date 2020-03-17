const core = require("@actions/core");
const github = require("@actions/github");
const axios = require("axios");

const GITHUB_TOKEN = core.getInput("github-token");
const YT_TOKEN = core.getInput("yt-token");
const YT_URL = core.getInput("yt-url");
const YT_LABEL_PREFIX = core.getInput("yt-label-prefix");
const YT_COLUMN_FIELD = core.getInput("yt-column-field");
const YT_PROJECT_ID = core.getInput("yt-project-id");
const YT_LABELS = core
  .getInput("yt-label-fields")
  .split(",")
  .map(x => x.trim().toLowerCase());
const YT_COLUMN_TRIGGERS = core
  .getInput("yt-column-triggers")
  .split(",")
  .map(x => x.trim().toLowerCase());
const YT_COLUMN_TARGET = core.getInput("yt-column-target");
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

    const comments = [];
    const labels = [];

    await asyncForEach(tickets, async issueId => {
      console.log("\n");

      if (!(await checkIssueExist(issueId))) {
        console.log(`(Skipping) ${issueId} does not exist`);
        return;
      }

      const fields = await getFields(issueId);
      const state = fields.find(x => x.name === YT_COLUMN_FIELD);
      const value = state.value && state.value.name.toLowerCase();

      if (!YT_COLUMN_TRIGGERS.some(x => x == value)) {
        console.log(`(Skipping) ${issueId} not found in column triggers`);
        return;
      }

      await commentYT(
        issueId,
        `New PR [#${github.context.issue.number}](${PR_URL}) opened at [${github.context.issue.owner}/${github.context.issue.repo}](${REPO_URL}) by ${github.context.actor}.`
      );

      await moveIssueTarget(issueId, state.id);

      comments.push(
        `- [${issueId}](${getIssueLink(issueId)}) from *${state.value.name}*`
      );

      console.log(`Comment PR with ticket ${issueId}`);

      await updatePR(issueId);

      YT_LABELS.forEach(async label => {
        const type = fields.find(x => x.name.toLowerCase() === label);

        if (type && type.value && type.name && type.value.name) {
          const value = type.value.name.toLowerCase();
          const name = type.name.toLowerCase();

          console.log(`Label PR with "${value}" from ticket ${issueId}`);
          labels.push(`${YT_LABEL_PREFIX}${name}/${value}`);
        }
      });
    });

    if (comments.length === 1) {
      await commentPR(
        `Moved YouTrack issue ${comments[0].slice(2)} to *${YT_COLUMN_TARGET}*`
      );
    } else if (comments.length > 1) {
      await commentPR(
        `Moved YouTrack issues to *${YT_COLUMN_TARGET}*\n` + comments.join("\n")
      );
    }

    if (labels.length !== 0) {
      await labelPR(labels);
    }
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

  return [...new Set(matches.map(x => x[0]))];
}

async function checkIssueExist(issueId) {
  const response = await ytApi.get(`${issueId}`);

  if (response.status === 404) {
    console.log(`Issue ${issueId} not found in your YouTrack instance`);
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

  console.log("Commented PR");
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
    ticket => `[${ticket}](${getIssueLink(issueId)})`
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

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

run();

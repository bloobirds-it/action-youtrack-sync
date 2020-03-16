# action-youtrack-sync

Action for syncing with YouTrack boards. It works by doing the following:

1. Create your desired ticket(s).

![Imgur](https://i.imgur.com/L7NvsSc.png)

2. Write your tickets on the pull request description.

![Imgur](https://i.imgur.com/aJpoJCQ.png)

3. See them turn into links towards the linked YouTrack.

![Imgur](https://i.imgur.com/ccEIvaf.png)

4. A comment with the status changed and the synced tickets will be added.

![Imgur](https://i.imgur.com/hGDI5lh.png)

5. Your pull request will be labeled with the specified fields of the ticket. (priority, type, project...)

![Imgur](https://i.imgur.com/wUHbZ4B.png)

6. Finally your ticket(s) is moved to the specified column.

![Imgur](https://i.imgur.com/115UBd6.png)

## Usage

Basic example with default options for a project where tickets look like _BB-123_.

```yaml
name: YouTrack Issue Sync

on:
  - pull_request

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: bloobirds-it/action-youtrack-sync@v1.0.0
        with:
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          youtrackUrl: ${{ secrets.YOUTRACK_URL }}
          youtrackToken: ${{ secrets.YOUTRACK_TOKEN }}
          youtrackProjectID: "BB"
```

Now when you open a pull request make sure to write your tickets in the description so the action can sync them.

## Parameters

#### `githubToken`

Your usual GitHub token, one is available by default as `${{ secrets.GITHUB_TOKEN }}`.

- **Required:** Yes

#### `youtrackUrl`

Base URL of your YouTrack instance.

- **Required:** Yes
- **Default:** "https://my-yt.myjetbrains.com/youtrack"

#### `youtrackToken`

YouTrack generated permanent token. For more info on [how to generate](https://www.jetbrains.com/help/youtrack/standalone/Manage-Permanent-Token.html).

- **Required:** Yes

#### `youtrackProjectId`

Issue ID prefix used in the projects. Basically the letters before your tickets.

- **Required:** Yes

#### `youtrackColumnField`

Name of the field which represents the ticket state.

- **Required:** No
- **Default:** "Stage"

#### `youtrackColumnTriggers`

Which columns will trigger the action. In other words, from which columns is the card allowed move to the target.

- **Required:** No
- **Default:** "To Do, To Fix, In Progress"

#### `youtrackColumnTarget`

To which column should the related tickets be moved.

- **Required:** No
- **Default:** "PR Open"

#### `youtrackLabelFields`

Which fields used to label the pull request.
If for example you have a ticket with the fields `{Type: Feature, Priority: Low}`, the action will label the PR with `type/feature` and `priority/low`.

- **Required:** No
- **Default:** "Type, Priority"

#### `youtrackLabelPrefix`

A prefix to append to the label that the action generates. If you set it for example to `@yt/`, the generated labels will look like `@yt/type/feature`.

- **Required:** No

## License

The scripts and documentation in this project are released under the MIT License

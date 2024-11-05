---
date: 2024-08-13
duration: 2024-
title: OmniSync
link: https://github.com/trevorpiltch/omnifocus-sync
description: Sync OmniFocus with issue trackers like GitHub and Shortcut.
---

# OmniSync

[Repo](https://github.com/trevorpiltch/omnifocus-sync) \
This is a Go-based CLI utility that seamlessly integrates OmniFocus with enterprise platforms (e.g.
GitHub, Shortcut), featuring comprehensive error handling and close to 90% test coverage

### Highlights

- **Software:** Written in Go, utilizing existing open source code
- **Features:** Import issues from any source to a specific OmniFocus project
- **Technical:** Includes JSON parsing, unit testing, and api handling

### Personal Impact

I don't think I use a piece of software more than I use [OmniFocus](https://www.omnigroup.com/omnifocus). Since 2019, I've kept every actionable item in my life organized in this app. As I got more into software, I realized there wasn't an easy way to sync the various bug tracking tools to OmniFocus. I found a script written [here](https://github.com/mikerhodes/github-to-omnifocus) (released under the open source ISC license) for syncing GitHub issues to OmniFocus. I loved the tool, although found it restrictive with only importing GitHub issues and only allowing one project at a time. So, I taught myself Go and wrote this project. I now use it everyday (as a toolbar button in OmniFocus) to stay in sync between OmniFocus, GitHub Issues, and Shortcut Stories.
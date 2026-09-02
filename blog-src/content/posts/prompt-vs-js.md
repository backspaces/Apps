---
title: Prompt vs JavaScript
date: 2026-07-15
---

Claude Code and I created a new AgentScript Model, the SchellingModel which explores segregation in neighborhoods.

A typical neighbor is comfortable with a percentage of similar neighbors. If they don't have that, they move to a new neighborhood and try again until comfortable.

We successfully built the model, building the needed JavaScript from a series of prompts, within .md files. This is typical: use a series of prompts to create the desired JavaScript.

Notice that the user does not use JavaScript directly, only English in the form of a prompt. Several people have commented on this as replacing JS with English.

This made us wonder: what if we did really kept the English and used it in different AI's to create the JS we want to run there? Really use English, via prompts, to be the source code!

Our first test was with Claude AI (browser) with the same prompts. It failed!

We modified the prompt to successfully create the model we wanted, and still worked in Claude Code. So now we had an English language version of the SchellingModel in two AIs.

So then we went to a new AI, Chrome's Gemini. It worked! We're on a roll so tried another AI. And it failed! So why? What is the problem?

The first problem is telling the AI to not guess if it needs some information not available to it. It should complain rather than guessing.

Similarly it should not use information in the environment in which it runs. Both are subtle: AI's really want to satisfy the users so will go beyond the prompts themselves.

So we thought we had nailed it: make sure the prompt is sufficiently strict and completely self contained.

Wow: just think, a github repo with prompts replacing the code they create. Well, it doesn't work! Why? Mainly AI's, like folks, change over time. So a prompt that works today may not work tomorrow. The use of language varies over time.

Sigh!

But we did decide to keep the prompts along with the JS of our models. They become the "README.md" for the model. And a way to recreate the model within new environments.

---
public: true
multilingual: false
style: product
---

# README requirements

## Product focus

- Introduce HagiCode Gallery as the public site at https://gallery.hagicode.com where visitors browse the image albums that HagiCode's `img-gen` pipeline publishes.
- Describe what visitors get: a home page listing the published albums, a grid page per album, a full-screen image viewer with zoom, pan, swipe and keyboard control, a details panel (key, pixel and byte size, prompts with copy buttons, seed, generation time), shareable links to a single image, ten interface languages, and a system, light or dark theme choice.
- Address visitors first. Mention how to run the site locally only briefly, for people who want to try it on their own machine.
- Lead with the product value: pictures you can look at closely and see how they were made. Do not open with the technology stack.

## Required content

- Open with a short product description and the link to the live site.
- Explain the albums and where their images come from, and state that pages work without JavaScript and respect reduced-motion settings, as the current README does.
- Describe the viewer and the language and theme features in user terms.
- Include a short local-run section: Node.js 24+ requirement and the install, dev, build and preview commands. Commands must match `package.json`.

## Exclusions

- Exclude storage keys, tokens, secret values, internal hosts, machine-specific paths and private links.
- Keep repository maintenance instructions out of the README: repository layout, internal architecture, CI and publication workflow, build internals, Hagilight pinning, shadcn component rules, design rules and contribution workflow.
- Do not list features the gallery does not show.

---
name: DogDays
description: The UGA schedule builder, built by DevDogs. Architecture and domain terms.
order: 30
---

# DogDays

[DogDays](https://dogdays.dev) is the Next.js app that plans a UGA student's
semester against real registrar data. It is built and run by
[DevDogs at UGA](https://devdogsuga.org), and every feature is written by club
members.

> [!TIP]
> Want to run it? Start at [Set up and run DogDays](./getting-started/setup.md).
> Picking up a task? The work is tracked as
> [GitHub issues](https://github.com/DevDogsUGA/DogDays/issues) in milestones,
> not in a doc.

## Architecture

- **Next.js on Workers.** Built and deployed through vinext
  (`vite.config.ts` + `@cloudflare/vite-plugin`). The Worker entry is
  `cloudflare/worker.ts`, and the KV-backed data and CDN cache ride the
  `VINEXT_KV_CACHE` binding.
- **Course data.** Terms, subjects, courses and sections come from the DevDogs
  catalog API. DogDays stores none of it. See [The course catalog](./guides/catalog.md).
- **Member data.** Drafts, saved plans and preferences live in DogDays' own
  Supabase project, in the `dogdays` schema, behind Row Level Security. See
  [DogDays database](./guides/schema.md).
- **Sign-in.** "Sign in with DevDogs" (`custom:devdogsuga` in Supabase). A
  signed-out visitor keeps everything in the browser and it moves to their
  account when they sign in.
- **Generation.** A rule-based engine searches conflict-free combinations of
  sections and ranks them. See [Schedule generation](./guides/generation.md).
- **Feedback and errors.** Sentry catches errors and the Feedback widget (the
  button on every page) sends what members type to the DogDays Sentry project.
  Session Replay is off.

## Glossary

- **Term**: one semester's registration period, keyed by an `academicPeriod` code.
- **Part of term**: a sub-window of a term with its own dates (a full-semester
  and an 8-week course in the same term have different parts of term).
- **Course**: a catalog entry (subject + course number + title), independent of any term.
- **Section**: one instance of a course in one term, keyed by its **CRN**.
  Cancelled sections are kept, not deleted, because saved plans reference a CRN.
- **CRN**: Course Reference Number, the registrar's key for a section.
- **Meeting**: one weekly time block of a section (days, times, building and room).
- **Schedule**: a conflict-free set of sections, one per requested course.
- **Rule**: one unit of generation logic that can reject a section, prune a
  partial schedule, reject a complete schedule, or score it.
- **Plan**: a saved schedule. Exportable as a `.dogdays.json` file
  (`src/lib/planFile/`).

## Where to go next

- [Set up and run DogDays](./getting-started/setup.md)
- [Your first contribution](./getting-started/first-contribution.md)
- [Where things live](./guides/where-things-live.md): "I want to change X"
- [Testing](./guides/testing.md)
- [The catalog](./guides/catalog.md), [the database](./guides/schema.md), [generation](./guides/generation.md)
- [Deployment](./infrastructure/deployment.md)

<!-- checkpoint 4 throwaway: fork PR with no secrets -->

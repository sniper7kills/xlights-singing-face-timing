---
paths:
  - "docs/**/*.md"
  - "*.md"
  - ".claude/rules/*.md"
  - ".claude/skills/**/*.md"
  - "src/**/*.{ts,tsx}"
  - "tests/**/*.{ts,tsx}"
  - "scripts/**/*.{mjs,sh}"
---

# Writing standard (STE)

Every spec file, issue body, comment, manual page and **code comment** in this
project uses Simplified Technical English. The controlled vocabulary of the project
is the `## Terms` table in `docs/specs/spec.md`. Read it before you write a domain
word. If you need a word that is not in the table, add it to the table.

## Reproduce verbatim, never rewrite

- Anything quoted from a person.
- Evidence: error messages, logs, console output, test names, stack traces,
  `file:line` references.
- Code, config, commands, JSON, paths, identifiers, label names.
- Third-party product names and API field names, including xLights names such as
  `EffectLayer` and the phoneme labels.
- UI copy inside mockups.

## Sentences

1. A procedure sentence has 20 words or fewer. A description sentence has 25 or
   fewer.
2. One instruction for each sentence.
3. One topic for each paragraph. Six sentences at most.
4. Put the condition first, then the action: "If the test fails, revert the commit."
5. Put a warning before the step it applies to.

## Words

6. One word, one meaning, one part of speech.
7. One concept, one word. Do not rotate synonyms. A "mark" is never an "effect" or
   a "cue". A "voice" is never a "singer" or a "face".
8. Keep noun clusters to three words.
9. No metaphor, idiom or slang.
10. No abbreviation that the Terms table does not define.

## Grammar

11. Active voice. The reader must know who acts.
12. Present tense for behaviour. Imperative for instructions.
13. Keep the articles.
14. No `-ing` form as a noun or as a heading.
15. Write positively. Keep a prohibition only when the wrong action is likely and
    costly.
16. Use a vertical list for more than two conditions, parameters or alternatives.

## Patterns

**Functional requirement.** One testable statement, active voice, present tense, no
conjunction. Not "should be able to". Not "after a while".

**Acceptance criterion.** One observable result. Not an implementation. Not "works
correctly".

**Issue title.** Imperative verb, one deliverable, 10 words or fewer.

**Issue body.** Headings `## Context`, `## What to build`, `## Acceptance criteria`,
`## Out of scope`. Each heading holds one kind of information.

**Manual step.** Second person, present tense, one action for each step.

**Code comment.** One sentence, one fact, active voice. State the reason that the
code cannot show. Delete a comment that repeats the code.

```
Bad:  // increment the counter
Good: // xLights moves each time down to a multiple of the frame size on import.
```

**Docstring.** The first sentence states the result. Then the parameters. Then the
failure modes.

**Test name.** One behaviour, present tense, active voice:
`writes three EffectLayer elements for a voice with no phonemes`.

**Marker comment.** Keep the keyword `TODO`, `FIXME` or `HACK`. Write the body in
STE and name the issue: `// TODO(#12): Read the frame size from the song.`

## Check before you write the file

- [ ] No sentence is longer than 25 words. No instruction is longer than 20.
- [ ] Every step holds one instruction.
- [ ] Every condition comes before its action. Every warning comes before its step.
- [ ] Every domain word is in the Terms table, with one meaning.
- [ ] No synonym rotation.
- [ ] No noun cluster longer than three words.
- [ ] No metaphor, idiom or undefined abbreviation.
- [ ] Active voice, present tense, articles present, no `-ing` nouns or headings.
- [ ] Lists carry anything with more than two conditions or parameters.
- [ ] Quotes, evidence, code, paths and identifiers are verbatim.
- [ ] Code comments state the reason. Docstrings open with the result. Test names
      read as one behaviour.

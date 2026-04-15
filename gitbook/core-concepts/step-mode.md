# Step Mode

Step mode is SF's interactive, one-step-at-a-time workflow. You stay in the loop, reviewing output between each step.

## Starting Step Mode

```
/sf
```

SF reads the state of your `.sf/` directory and presents a wizard showing what's completed and what's next. It then executes one unit of work and pauses.

## How It Works

Step mode adapts to your project's current state:

| State | What Happens |
|-------|-------------|
| No `.sf/` directory | Starts a discussion flow to capture your project vision |
| Milestone exists, no roadmap | Opens a discussion or research phase for the milestone |
| Roadmap exists, slices pending | Plans the next slice or executes the next task |
| Mid-task | Resumes where you left off |

After each unit completes, you see results and decide what to do next. This is ideal for:

- New projects where you want to shape the architecture
- Critical work where you want to review each step
- Learning how SF works before trusting auto mode

## Steering During Step Mode

Between steps, you can:

- **Discuss** — `/sf discuss` to talk through architecture decisions
- **Skip** — `/sf skip` to prevent a unit from being dispatched
- **Undo** — `/sf undo` to revert the last completed unit
- **Switch to auto** — `/sf auto` to let SF continue autonomously

## When to Use Step Mode

- **First milestone** — Review SF's work before trusting it to run solo
- **Architectural decisions** — When you want to guide the approach
- **Unfamiliar codebases** — When you want to ensure SF understands the project
- **High-stakes changes** — When mistakes would be costly

## Transitioning to Auto Mode

Once you're comfortable with SF's approach, switch to auto mode:

```
/sf auto
```

You can always press **Escape** to pause auto mode and return to step-by-step control.

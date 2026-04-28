# PlainID POC Builder

Internal SE tool for authoring standardized PlainID POC documents. Single-page sectioned
form with completeness indicators, a shared use case library, live HTML preview, and
DOCX export. Built on AWS Amplify Gen 2 (Cognito + DynamoDB via AppSync).

- **Auth:** Cognito, restricted to `@plainid.com` via a pre-sign-up Lambda
- **Data:** Two DynamoDB tables (`Poc`, `UseCaseLibraryEntry`) provisioned by Amplify Data
- **Authorization model:**
  - Each `Poc` is owned by its creator (full CRUD); the rest of the team has read-only access for browsing and inspiration
  - The use case library is fully shared (any signed-in `@plainid.com` user can edit)
- **Library snapshot model:** when a library entry is inserted into a POC, its content is copied. Editing the library entry afterward does **not** propagate.
- **Output:** HTML preview (in-app) + DOCX download (`docx` package, generated client-side)

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS v4 + react-router-dom v6 |
| Auth | Amplify Gen 2 (`defineAuth`) → Cognito User Pool + pre-sign-up Lambda |
| Data | Amplify Gen 2 (`defineData`) → AppSync GraphQL + DynamoDB |
| Hosting | AWS Amplify Hosting (built from this repo, `amplify.yml`) |
| DOCX | `docx` package (client-side, no Lambda) |

---

## Local development

### Prerequisites

- Node.js 20+
- An AWS account with CLI credentials configured (`aws configure`) — used by the Amplify sandbox to spin up your personal dev backend

### One-time setup

```bash
git clone <your-repo-url> plainid-poc-builder
cd plainid-poc-builder
npm install
```

### Run the sandbox + dev server

In two terminals:

```bash
# Terminal 1: provisions your personal cloud backend (Cognito + DDB) and watches for changes
npx ampx sandbox

# Terminal 2: Vite dev server
npm run dev
```

The sandbox writes `amplify_outputs.json` to the repo root — that's how the frontend finds
your User Pool and AppSync endpoint. It's gitignored.

Open <http://localhost:5173>. Sign up with a `@plainid.com` email; the pre-sign-up Lambda
auto-confirms you.

When you're done for the day:

```bash
npx ampx sandbox delete   # tears down your personal backend
```

---

## Project layout

```
plainid-poc-builder/
├── amplify/
│   ├── auth/
│   │   ├── pre-sign-up/
│   │   │   ├── handler.ts          # Lambda: rejects non-@plainid.com signups
│   │   │   └── resource.ts
│   │   └── resource.ts             # defineAuth + trigger
│   ├── data/
│   │   └── resource.ts             # Poc + UseCaseLibraryEntry models
│   ├── backend.ts
│   ├── package.json
│   └── tsconfig.json
├── src/
│   ├── components/
│   │   ├── sections/
│   │   │   └── Sections.tsx        # all 10 form sections
│   │   ├── ui/
│   │   │   └── Primitives.tsx      # Button, Field, SectionCard, Pill, Modal, EmptyState
│   │   ├── Layout.tsx              # top nav
│   │   ├── PocList.tsx             # dashboard
│   │   ├── PocEditor.tsx           # main editor with sidebar nav + autosave
│   │   ├── PocPreview.tsx          # HTML preview
│   │   └── UseCaseLibrary.tsx      # library management
│   ├── lib/
│   │   ├── client.ts               # Amplify Data client + serializers
│   │   ├── completeness.ts         # qualification logic per section
│   │   ├── docx-generator.ts       # DOCX export
│   │   ├── html-generator.ts       # HTML preview / export
│   │   └── seed-data.ts            # 13 use case templates from TI doc + defaults
│   ├── App.tsx                     # Authenticator + routes + library bootstrap
│   ├── main.tsx                    # entry
│   ├── index.css                   # Tailwind v4 + theme tokens + Geist/JetBrains Mono
│   └── types.ts                    # PocDocument schema, UseCase, etc.
├── public/
│   └── favicon.svg
├── amplify.yml                     # Amplify Hosting build spec
├── index.html
├── package.json
├── postcss.config.js
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── .gitignore
└── README.md
```

---

## Deploy to AWS Amplify Hosting

This is a one-time setup per environment. The whole thing — Cognito, DynamoDB, AppSync,
the React build — is provisioned by Amplify when you connect the git repo. There's no
separate CDK or CloudFormation step.

### 1. Push to git

```bash
cd plainid-poc-builder
git init
git add .
git commit -m "Initial commit: PlainID POC Builder"
git branch -M main
git remote add origin <your-remote-url>
git push -u origin main
```

### 2. Connect the repo to Amplify Hosting

1. Open the AWS Console → **Amplify** (any region works; suggest `us-east-1`)
2. Click **Create new app** → **Host web app**
3. Pick your git provider (GitHub / GitLab / Bitbucket / CodeCommit) and authorize
4. Select the `plainid-poc-builder` repo and the `main` branch
5. **Build settings:** Amplify will auto-detect `amplify.yml` — leave it as-is. The framework should be detected as **Vite** with backend deployment enabled.
6. **Service role:** if Amplify prompts for an IAM service role, click **Create new service role**. It needs permissions to deploy the Amplify Gen 2 backend (Cognito, AppSync, DynamoDB, Lambda). The auto-generated role is correct.
7. Click **Save and deploy**

The first build takes ~8–12 minutes because it provisions the full backend (User Pool, the pre-sign-up Lambda, AppSync API, two DynamoDB tables) **and** builds the frontend.

### 3. Verify the resources

After the deploy succeeds, in the AWS Console:

- **Cognito** → User Pools → there will be one named like `amplifyAuthUserPool…`. Confirm:
  - Sign-in option: Email
  - Self-service sign-up: enabled
  - Lambda triggers: pre-sign-up trigger pointing to a Lambda named `…pre-sign-up…`
- **DynamoDB** → Tables → two tables named like `Poc-…` and `UseCaseLibraryEntry-…`
- **AppSync** → APIs → one API named like `amplifyData-…`
- **Lambda** → one function named like `…pre-sign-up…` whose source is `amplify/auth/pre-sign-up/handler.ts`

### 4. First sign-in seeds the library

The first authenticated user to load the app will trigger the library bootstrap, which
creates the 13 seeded use cases (extracted from the Texas Instruments POC + general
patterns). This runs once — subsequent loads are no-ops.

If you ever need to re-seed an empty library, just delete every entry in the
`UseCaseLibraryEntry` table and refresh the app.

### 5. (Optional) Custom domain

In the Amplify app → **Hosting** → **Custom domains** → add your domain. Amplify handles
the certificate and DNS validation. Wire whatever DNS you want; the default
`https://main.<app-id>.amplifyapp.com` URL also works.

---

## How the @plainid.com restriction works

The pre-sign-up Lambda (`amplify/auth/pre-sign-up/handler.ts`) inspects the email on
sign-up and throws if the domain isn't `plainid.com`. Cognito surfaces the thrown error
as a sign-up failure. The same Lambda also auto-confirms verified `@plainid.com` users
so they can sign in immediately without the email verification step.

To change the allowed domain (e.g. add a partner domain), edit:

```ts
// amplify/auth/pre-sign-up/handler.ts
const ALLOWED_DOMAIN = 'plainid.com';
```

Push the change; Amplify will redeploy the Lambda.

---

## Key design decisions

- **Single-page sectioned form, not a wizard.** SEs need to fill in pieces non-linearly during a discovery call, not be force-marched through a flow.
- **Completeness indicators, not blockers.** Required fields drive the sidebar dots and percentage but don't block export — the goal is to make under-baked POCs visibly under-baked, not to lecture.
- **Library is snapshotted at insertion.** Updating the library entry afterward does not retroactively change POCs that already inserted it. This is deliberate — POCs become contracts with customers; we don't want a quiet edit to mutate them.
- **Team browse is read-only.** Anyone can read every POC for inspiration / onboarding; only the owner can edit.
- **DOCX is generated client-side.** No Lambda for export means no IAM, no timeouts, no S3 round-trip. The `docx` package runs in the browser.

---

## Adding a new section to the form

1. Add the field(s) to `PocDocument` in `src/types.ts`
2. Add corresponding fields to the `Poc` model in `amplify/data/resource.ts`
3. Add serialization in `src/lib/client.ts` (`fromRecord` / `toRecord`)
4. Add a section component to `src/components/sections/Sections.tsx`
5. Add the section id to the `SECTIONS` array in `src/types.ts`
6. Add completeness rules to `src/lib/completeness.ts`
7. Add rendering to `src/lib/html-generator.ts` and `src/lib/docx-generator.ts`
8. Mount the new section in `PocEditor.tsx`

---

## Troubleshooting

**"Sign-up is restricted to @plainid.com email addresses"**
You're trying to sign up with a non-`@plainid.com` email. By design.

**`amplify_outputs.json` not found at startup**
Run `npx ampx sandbox` to provision your personal backend; it generates the file. In
production, Amplify Hosting writes it during the build.

**Sandbox build fails with permissions errors**
Check that your local AWS credentials have permission to deploy CDK stacks. The sandbox
uses your CLI profile by default — `AWS_PROFILE=<profile> npx ampx sandbox` to override.

**Library never seeds**
The bootstrap runs once per database. If your sandbox table somehow has a row already
(even one), it skips. Delete all rows from `UseCaseLibraryEntry` and refresh.

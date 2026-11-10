import type { ReactNode } from "react";
import styles from "./LegalDocument.module.css";

/** A detail the operator still has to fill in before the policy is final; marked so it is not mistaken for data. */
function Pending({ children }: { children: ReactNode }) {
  return <span className={styles.pending}>{children}</span>;
}

const CONTACT = <Pending>[Privacy contact email]</Pending>;

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "who-we-are",
    title: "1. Who We Are",
    body: (
      <>
        <p>
          Metrivum is a digital platform designed for coaches, athletes, and
          individuals managing training and performance.
        </p>
        <p>The service is operated by:</p>
        <dl className={styles.facts}>
          <div>
            <dt>Data Controller</dt>
            <dd>
              <Pending>[Full legal name or registered business name]</Pending>
            </dd>
          </div>
          <div>
            <dt>Registered Address</dt>
            <dd>
              <Pending>[Business address]</Pending>
            </dd>
          </div>
          <div>
            <dt>Privacy Contact</dt>
            <dd>{CONTACT}</dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd>
              <a href="https://metrivum.com">https://metrivum.com</a>
            </dd>
          </div>
        </dl>
        <p>
          The operator of Metrivum determines the purposes and means of
          processing personal data relating to the operation, security, and
          administration of the platform.
        </p>
        <p>
          Coaches and organizations using Metrivum may independently determine
          how they process certain client information. Depending on their
          activities, they may act as separate data controllers.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "2. Information We Collect",
    body: (
      <>
        <p>
          We collect information necessary to operate Metrivum and provide its
          features.
        </p>
        <h3>Account and Profile Information</h3>
        <p>When creating or managing an account, we may process:</p>
        <ul>
          <li>Email address and authentication identifiers</li>
          <li>Username, first name, last name, and display name</li>
          <li>Date of birth</li>
          <li>Optional phone number and profile description</li>
          <li>Account roles, preferences, language, and time zone</li>
          <li>Profile visibility settings</li>
          <li>Authentication and account security information</li>
        </ul>
        <p>
          Passwords and authentication credentials are handled through our
          authentication provider, Supabase Auth.
        </p>
        <h3>Training and Performance Information</h3>
        <p>Depending on the features you use, Metrivum may store:</p>
        <ul>
          <li>Training programs, exercises, and workout schedules</li>
          <li>Completed workouts and training history</li>
          <li>
            Sets, repetitions, weights, durations, and performance results
          </li>
          <li>
            Physical measurements, including weight, height, body dimensions,
            and body fat percentage
          </li>
          <li>Training goals, progress records, and personal notes</li>
          <li>Check-in responses and coaching documentation</li>
          <li>Uploaded images, videos, audio recordings, and other files</li>
        </ul>
        <p>
          Some information may reveal aspects of your physical condition or
          health.
        </p>
        <h3>Communication and Collaboration Information</h3>
        <p>When using coaching and communication features, we may process:</p>
        <ul>
          <li>Messages and conversation history</li>
          <li>Message attachments and voice recordings</li>
          <li>Group memberships and collaboration records</li>
          <li>Coaching applications, invitations, and agreements</li>
          <li>Calendar events, appointments, and participation responses</li>
          <li>Reports of inappropriate content or conduct</li>
        </ul>
        <h3>Subscription and Transaction Information</h3>
        <p>
          Metrivum may process subscription plans, transaction records, billing
          preferences, and payment statuses.
        </p>
        <p className={styles.callout}>
          <strong>
            The current payment system uses simulated transactions.
          </strong>{" "}
          It does not process real card payments or collect payment card numbers
          through the simulator.
        </p>
        <p>
          If real payment processing is introduced, this policy will be updated
          to identify the relevant payment providers and processing activities.
        </p>
        <h3>Technical and Security Information</h3>
        <p>
          When you access the service, we and our infrastructure providers may
          process technical information such as:
        </p>
        <ul>
          <li>IP addresses and connection metadata</li>
          <li>Browser, operating system, and device information</li>
          <li>Request timestamps and diagnostic information</li>
          <li>Authentication activity and security events</li>
          <li>Application errors and operational logs</li>
          <li>Device and notification identifiers, where applicable</li>
        </ul>
        <p>
          This information helps us maintain reliability, prevent abuse, and
          protect user accounts.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "3. How We Use Your Information",
    body: (
      <>
        <p>We use personal information for the following purposes:</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Purpose</th>
                <th scope="col">Legal basis under GDPR</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Creating accounts and providing platform services</td>
                <td>Article 6(1)(b) — performance of a contract</td>
              </tr>
              <tr>
                <td>
                  Managing training, coaching, communication, and collaboration
                  features
                </td>
                <td>Article 6(1)(b) — performance of a contract</td>
              </tr>
              <tr>
                <td>
                  Providing requested profile and coach-discovery features
                </td>
                <td>Article 6(1)(b), where applicable</td>
              </tr>
              <tr>
                <td>
                  Securing accounts, preventing fraud, and investigating abuse
                </td>
                <td>Article 6(1)(f) — legitimate interests</td>
              </tr>
              <tr>
                <td>
                  Maintaining technical logs and improving service reliability
                </td>
                <td>Article 6(1)(f) — legitimate interests</td>
              </tr>
              <tr>
                <td>Complying with applicable legal requirements</td>
                <td>Article 6(1)(c) — legal obligation</td>
              </tr>
              <tr>
                <td>Optional activities that specifically require consent</td>
                <td>Article 6(1)(a) — consent</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Our legitimate interests include maintaining a secure, reliable
          platform, detecting unauthorized activity, and protecting users from
          misuse.
        </p>
        <p>
          Where personal information qualifies as special-category health data,
          an additional condition under Article 9 GDPR is necessary.
        </p>
      </>
    ),
  },
  {
    id: "sharing-between-users",
    title: "4. How Information Is Shared Between Users",
    body: (
      <>
        <p>
          Metrivum is a collaborative platform. Certain information is shared to
          provide the features you choose to use.
        </p>
        <p>For example:</p>
        <ul>
          <li>
            Coaches may access information necessary to manage their coaching
            relationships.
          </li>
          <li>
            Clients may access training programs, documents, and other
            information shared with them.
          </li>
          <li>
            Conversation participants can access messages and attachments
            according to their membership permissions.
          </li>
          <li>
            Members of teams or organizations may access information based on
            their assigned roles and applicable permissions.
          </li>
          <li>
            Authorized users may see profile information made available through
            account and discovery features.
          </li>
        </ul>
        <p>
          Some profile information, such as your username, display name, and
          biography, may be visible to other authenticated users.
        </p>
        <p>
          Private coaching notes and documents are subject to additional access
          and visibility controls. Users can choose the sharing settings offered
          by the relevant feature.
        </p>
        <p>
          You should avoid sharing information with other users unless you
          intend those users to receive it.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "5. Third-Party Services and Infrastructure",
    body: (
      <>
        <p>
          Metrivum relies on external infrastructure providers to operate its
          services.
        </p>
        <p>These may include:</p>
        <dl className={styles.providers}>
          <div>
            <dt>Supabase</dt>
            <dd>
              Authentication, PostgreSQL database infrastructure, and private
              file storage.
            </dd>
          </div>
          <div>
            <dt>Cloudflare</dt>
            <dd>
              Website delivery, network infrastructure, security, and
              distribution of application resources.
            </dd>
          </div>
          <div>
            <dt>Railway</dt>
            <dd>Application API hosting and related server infrastructure.</dd>
          </div>
          <div>
            <dt>Expo and platform notification providers</dt>
            <dd>
              Push notification delivery for supported mobile applications, when
              enabled.
            </dd>
          </div>
          <div>
            <dt>Email delivery providers</dt>
            <dd>
              Delivery of authentication, account security, and service-related
              emails.
            </dd>
          </div>
          <div>
            <dt>External AI and integration providers</dt>
            <dd>
              Only when users choose to connect supported third-party services.
            </dd>
          </div>
        </dl>
        <p>
          These providers may process information necessary to perform their
          respective services.
        </p>
        <p>
          <strong>We do not sell personal information to advertisers.</strong>
        </p>
        <p>
          Where personal data is transferred outside the European Economic Area,
          the applicable transfer mechanism and safeguards must comply with
          Chapter V of the GDPR. Information about the safeguards applicable to
          your data can be requested using the privacy contact details above.
        </p>
      </>
    ),
  },
  {
    id: "integrations",
    title: "6. AI Assistants and External Integrations",
    body: (
      <>
        <p>
          Metrivum supports connections with external services, including AI
          assistants, through authorized integrations.
        </p>
        <p>When you connect an integration:</p>
        <ul>
          <li>You select the permissions available to that integration.</li>
          <li>
            The integration may receive information accessible under those
            permissions.
          </li>
          <li>Certain actions require additional approval within Metrivum.</li>
          <li>
            You can review and revoke connected integrations through the
            platform's settings.
          </li>
        </ul>
        <p>
          Depending on the permissions granted, shared information may include
          training programs, client information, messages, check-ins, calendar
          events, and business analytics.
        </p>
        <p>
          Connected services are operated by their respective providers and may
          have independent privacy policies.
        </p>
        <p>
          Metrivum does not automatically grant external integrations
          unrestricted access to your account.
        </p>
        <p>
          Connecting an external integration does not, by itself, authorize the
          provider to process your data for every purpose described in its own
          services.
        </p>
        <p>
          Before connecting an integration, review the provider's privacy
          practices.
        </p>
      </>
    ),
  },
  {
    id: "files",
    title: "7. Photos, Videos, Audio, and Other Files",
    body: (
      <>
        <p>
          Metrivum allows users to upload and manage files, including training
          videos, progress photos, documents, and communication attachments.
        </p>
        <p>
          Uploaded files may be stored in private cloud storage and accessed
          through authorized application operations.
        </p>
        <p>
          Some analysis features may process information locally on your device.
          Where supported, local analysis results may be saved to Metrivum
          without uploading the original video.
        </p>
        <p>
          If you upload media to cloud storage, that media is processed and
          stored according to the relevant feature's functionality and access
          controls.
        </p>
        <p>
          You are responsible for ensuring that you have the necessary rights
          and permissions to upload and share content involving other
          individuals.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "8. Cookies and Local Storage",
    body: (
      <>
        <p>
          Metrivum uses browser storage technologies to support authentication,
          account switching, security, and user preferences.
        </p>
        <p>
          These include browser <code>localStorage</code> and{" "}
          <code>sessionStorage</code>.
        </p>
        <p>
          For example, browser storage may retain authenticated sessions and
          information about the active account.
        </p>
        <p>
          These technologies are used to provide functionality requested by
          users.
        </p>
        <p>
          Infrastructure and authentication providers may also use technically
          necessary storage mechanisms.
        </p>
        <p>
          If optional tracking or analytics technologies requiring consent are
          introduced, we will provide the legally required information and
          consent choices before using them.
        </p>
        <p>
          You can manage browser storage through your browser settings. Removing
          essential stored information may sign you out or reset application
          preferences.
        </p>
      </>
    ),
  },
  {
    id: "mobile",
    title: "9. Mobile Application Permissions and Local Data",
    body: (
      <>
        <p>
          Depending on the platform and features used, the mobile application
          may request access to:
        </p>
        <ul>
          <li>Notifications</li>
          <li>Camera, photos, or media files</li>
          <li>Microphone for voice messages</li>
        </ul>
        <p>
          These permissions are used for the corresponding functionality and can
          be managed through your device settings.
        </p>
        <p>
          The mobile application may also store encrypted local drafts of
          unfinished work. The current draft storage is designed around a
          seven-day retention window and is cleared according to the
          application's account and storage lifecycle.
        </p>
        <p>
          Signing out removes the application's stored account session and
          associated local drafts, subject to device and operating-system
          behavior.
        </p>
        <p>
          Deleting local application data does not necessarily delete data
          already synchronized to the Metrivum servers.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "10. Data Retention",
    body: (
      <>
        <p>
          We retain personal information only for as long as necessary to
          provide our services and fulfill legitimate operational or legal
          purposes.
        </p>
        <p>
          Retention depends on the type of information and the reason for
          processing it.
        </p>
        <p>
          Account information is generally retained while the account remains
          active. Training and collaboration records may remain necessary to
          provide historical access to authorized users.
        </p>
        <p>
          Some information, including transaction histories, audit records,
          moderation evidence, and records associated with other users, may
          require separate retention periods.
        </p>
        <p>
          Deleting a document or ending a coaching relationship does not
          necessarily remove every associated historical or retained record
          immediately.
        </p>
        <p>
          Where applicable, data may also remain temporarily in backups or
          deletion-processing systems.
        </p>
        <p>
          When information is no longer required and no applicable retention
          obligation remains, it will be deleted or anonymized in accordance
          with the relevant retention procedures.
        </p>
        <p>
          Users may request deletion of their personal information using the
          contact details provided in this policy.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "11. Data Security",
    body: (
      <>
        <p>
          We take technical and organizational measures designed to protect
          personal information.
        </p>
        <p>These include, where applicable:</p>
        <ul>
          <li>Authenticated access and permission checks</li>
          <li>Restricted access to private application data</li>
          <li>Encrypted network connections</li>
          <li>Private media storage and time-limited download links</li>
          <li>Security monitoring and abuse prevention</li>
          <li>
            Additional account security features, including supported two-factor
            authentication
          </li>
          <li>Encrypted storage for certain mobile application data</li>
        </ul>
        <p>
          Despite these measures, no internet-based system can guarantee
          absolute security.
        </p>
        <p>
          If you believe your account has been compromised, please contact us.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "12. Your Privacy Rights",
    body: (
      <>
        <p>Where the GDPR applies, you may have the right to:</p>
        <ul>
          <li>Access personal information held about you</li>
          <li>Request correction of inaccurate information</li>
          <li>Request deletion of personal information</li>
          <li>Restrict certain processing activities</li>
          <li>Object to processing based on legitimate interests</li>
          <li>Receive eligible personal data in a portable format</li>
          <li>Withdraw consent where processing is based on consent</li>
          <li>Lodge a complaint with a competent data protection authority</li>
        </ul>
        <p>You may exercise your rights by contacting {CONTACT}.</p>
        <p>We may need to verify your identity before fulfilling a request.</p>
        <p>
          Certain requests may be subject to legal exceptions, including
          obligations to preserve necessary records or protect the rights of
          others.
        </p>
        <p>
          If you are located in Poland, you may lodge a complaint with the
          President of the Personal Data Protection Office (UODO):{" "}
          <a href="https://uodo.gov.pl" target="_blank" rel="noreferrer">
            https://uodo.gov.pl
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "automated-processing",
    title: "13. Automated Processing and Analytics",
    body: (
      <>
        <p>
          Metrivum uses software to calculate training metrics, generate
          statistics, organize information, and support training-related
          workflows.
        </p>
        <p>
          These calculations may include performance trends, training progress,
          business analytics, and the ordering of discovery results.
        </p>
        <p>
          Metrivum does not currently use these processes to make decisions
          producing legal or similarly significant effects on individuals solely
          through automated decision-making.
        </p>
      </>
    ),
  },
  {
    id: "age",
    title: "14. Age Restrictions",
    body: (
      <>
        <p>
          Metrivum is intended for individuals aged{" "}
          <strong>18 years or older</strong>.
        </p>
        <p>
          Users are required to declare that they meet the minimum age
          requirement during onboarding.
        </p>
        <p>
          Metrivum is not intended for children, and individuals under 18 should
          not register for an account.
        </p>
        <p>
          If we become aware that an account has been created by an underage
          individual, we may take appropriate steps to restrict the account and
          handle the associated information in accordance with applicable law.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "15. Changes to This Policy",
    body: (
      <>
        <p>
          We may update this Privacy Policy when our services, data processing
          practices, or legal obligations change.
        </p>
        <p>
          The current version will be available on the Metrivum website, with
          its latest revision date.
        </p>
        <p>
          Where required by applicable law, we will provide additional notice or
          obtain consent before introducing materially different processing
          activities.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "16. Contact",
    body: (
      <>
        <p>
          For questions about this Privacy Policy, personal information, or
          privacy rights, please contact:
        </p>
        <dl className={styles.facts}>
          <div>
            <dt>Service</dt>
            <dd>Metrivum</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{CONTACT}</dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd>
              <a href="https://metrivum.com">https://metrivum.com</a>
            </dd>
          </div>
        </dl>
      </>
    ),
  },
];

/** The privacy policy: a contents list beside the text on wide screens, numbered sections with anchors. */
export function PrivacyPolicy({ notice }: { notice?: string }) {
  return (
    <div className={styles.layout}>
      <nav className={styles.toc} aria-label="Contents">
        <p className={styles.tocTitle}>Contents</p>
        <ol>
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>
                {section.title.replace(/^\d+\.\s*/, "")}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <article className={styles.document}>
        {notice ? (
          <p className={styles.notice} lang="pl">
            {notice}
          </p>
        ) : null}
        <p className={styles.updated}>Last updated: November 10, 2026</p>
        <p>
          At Metrivum, we respect your privacy and are committed to protecting
          your personal information. This Privacy Policy explains how we
          collect, use, store, share, and protect personal data when you use the
          Metrivum website, applications, and related services.
        </p>
        <p>
          By using Metrivum, you can manage training programs, track
          performance, communicate with coaches and clients, and access other
          coaching and fitness management tools.
        </p>
        <p>
          Please read this Privacy Policy to understand how your information is
          handled.
        </p>
        {SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className={styles.section}
            aria-labelledby={`${section.id}-title`}
          >
            <h2 id={`${section.id}-title`}>{section.title}</h2>
            {section.body}
          </section>
        ))}
      </article>
    </div>
  );
}

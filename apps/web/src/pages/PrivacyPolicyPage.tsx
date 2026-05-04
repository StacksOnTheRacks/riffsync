import { useEffect } from 'react'
import { Link } from 'react-router-dom'

const LAST_UPDATED = 'May 4, 2026'
const BASE_TITLE = 'RiffSync'

export function PrivacyPolicyPage() {
  useEffect(() => {
    const previous = document.title
    document.title = `Privacy Policy — ${BASE_TITLE}`
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="riffsync-legal">
      <div className="container">
        <h1>Privacy Policy</h1>
        <p className="riffsync-legal__meta text-muted">Last updated: {LAST_UPDATED}</p>

        <section>
          <h2>1. Overview</h2>
          <p>
            This Privacy Policy describes how RiffSync (&ldquo;RiffSync,&rdquo; &ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and shares information when you use
            our website, catalog, lobby, watch-party rooms, authentication flows, and related services
            (collectively, the &ldquo;Service&rdquo;). It applies wherever this Policy is posted or linked.
          </p>
          <p>
            This Policy works alongside our{' '}
            <Link to="/terms">Terms of Service</Link>. If you do not agree with this Policy, please do
            not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Information we collect</h2>
          <p>Depending on how you use the Service, we may process:</p>
          <ul>
            <li>
              <strong>Guest or session identifiers.</strong> To join lobby listings, rooms, chat, or
              realtime features without signing in, your browser may store or send identifiers (for
              example a locally generated session id and display label). These help tie your connection
              to a room while you participate.
            </li>
            <li>
              <strong>Account and authentication data.</strong> If you sign in (for example through an
              identity provider such as Amazon Cognito Hosted UI or linked social login), we receive and
              store identifiers issued by that provider (such as a stable subject id or email where the
              provider shares it) as needed to operate hosting and moderation features.
            </li>
            <li>
              <strong>Room and session metadata.</strong> When you host or join watch parties, we process
              information such as room ids, catalog selections, lobby-visible titles or labels you set,
              visibility flags, activity timestamps, and similar operational fields needed to run sessions.
            </li>
            <li>
              <strong>Chat and signaling payloads.</strong> Messages you send in room chat and realtime
              signaling messages used to establish playback may pass through our servers for delivery to
              other participants.
            </li>
            <li>
              <strong>Screen capture for WebRTC hosting.</strong> If you choose to host and use your
              browser&rsquo;s screen or tab capture, video and audio from the surface you select are
              processed for live distribution to participants in that session. Capture occurs through your
              browser&rsquo;s APIs; we do not upload your entire desktop recording as a persistent archive
              solely because you pressed share—delivery is oriented toward realtime peers connected to the
              room. Operational logs may still reflect connection metadata as described below.
            </li>
            <li>
              <strong>Technical and operations data.</strong> Like most sites, our hosting infrastructure
              may automatically collect technical information such as IP addresses, device or browser
              types, timestamps, routing diagnostics, and security logs when you request pages or APIs or
              connect to websocket endpoints.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. How we use information</h2>
          <p>We use the categories above to:</p>
          <ul>
            <li>Provide, operate, secure, and improve the Service;</li>
            <li>Maintain sessions, rooms, chat, authentication, and lobby behavior;</li>
            <li>Facilitate realtime connectivity between hosts and guests;</li>
            <li>Troubleshoot outages, abuse, or misuse;</li>
            <li>Comply with law or enforce our Terms.</li>
          </ul>
        </section>

        <section>
          <h2>4. Sharing</h2>
          <p>
            We share information with service providers who assist us (for example cloud hosting,
            databases, APIs, authentication, or certificates) subject to contractual safeguards appropriate
            to the deployment.
          </p>
          <p>
            Chat messages and realtime payloads may be visible to other participants in the same room by
            design.
          </p>
          <p>
            We may disclose information if we reasonably believe disclosure is required by law, legal
            process, or governmental request, or to protect the rights, safety, or integrity of users or
            the Service.
          </p>
          <p>
            We do not sell your personal information as &ldquo;sale&rdquo; is commonly understood in U.S.
            state privacy laws; we also do not share personal information for cross-context behavioral
            advertising based on activity across unrelated businesses.
          </p>
          <p className="text-muted">
            <strong>Note:</strong> Product operators should confirm vendor subprocessors (AWS regions,
            Cognito settings, analytics, if any) against the live deployment.
          </p>
        </section>

        <section>
          <h2>5. Cookies, local storage, and similar technologies</h2>
          <p>
            We may use browser storage (including local or session storage) and cookies where needed for
            sessions, preferences, authentication returns, or anti-abuse. You can limit some storage
            through browser settings; doing so may break features that require persistence.
          </p>
        </section>

        <section>
          <h2>6. Third-party embeds and links</h2>
          <p>
            Playback may embed or link to third-party players (for example YouTube). Those services have
            their own privacy notices and may collect information directly from your device. We do not
            control their practices; review their policies before interacting with embedded players.
          </p>
        </section>

        <section>
          <h2>7. Retention</h2>
          <p>
            We retain operational and account-related data only as long as needed for the purposes above,
            unless a longer period is required by law or legitimate security or dispute resolution needs.
            Ephemeral websocket connection records may expire on a short timetable in the deployed
            infrastructure.
          </p>
        </section>

        <section>
          <h2>8. Security</h2>
          <p>
            We use industry-standard measures appropriate to the Service, including encryption in transit
            where configured for HTTPS/WSS and access controls on backend resources. No method of
            transmission or storage is perfectly secure.
          </p>
        </section>

        <section>
          <h2>9. Children</h2>
          <p>
            The Service is not directed to children under 13 (or the minimum age required in your
            jurisdiction). Do not provide personal information if you do not meet that age requirement.
          </p>
        </section>

        <section>
          <h2>10. International users</h2>
          <p>
            Data may be processed in the United States or other jurisdictions where our infrastructure
            resides. If you access the Service from outside those regions, you consent to transfer and
            processing subject to applicable law.
          </p>
        </section>

        <section>
          <h2>11. Your choices and rights</h2>
          <p>
            Depending on where you live, you may have rights to access, correct, delete, or restrict
            certain personal information, or to object to particular processing. To exercise rights tied to
            an account, contact us using the channels below; we may need to verify your request.
          </p>
          <p>
            Guests without accounts may clear browser storage or leave rooms to discontinue identifiers tied
            to that browser profile.
          </p>
        </section>

        <section>
          <h2>12. Changes</h2>
          <p>
            We may update this Policy from time to time by posting a revised version on this page and
            updating the &ldquo;Last updated&rdquo; date. Continued use after changes become effective
            constitutes acceptance where permitted by law.
          </p>
        </section>

        <section>
          <h2>13. Contact</h2>
          <p>
            For privacy questions, contact the RiffSync maintainers via the channels listed on our public
            repository or website (for example{' '}
            <a href="https://github.com/StacksOnTheRacks/riffsync" rel="noopener noreferrer">
              GitHub
            </a>
            ). Replace this section with a dedicated privacy inbox when available.
          </p>
        </section>
      </div>
    </div>
  )
}

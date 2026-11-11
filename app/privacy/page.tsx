import Link from "next/link";
export const metadata = { title: "Privacy Policy | TileSPEC" };
export default function PrivacyPage() {
 return <main style={{maxWidth:850,margin:"0 auto",padding:"48px 24px",lineHeight:1.75}}>
 <Link href="/">← TileSPEC home</Link><h1>Privacy policy</h1>
 <p>TileSPEC receives information you choose to submit when making a commercial enquiry or sending tender documents. This can include your name, contact details, project information and uploaded files.</p>
 <h2>How information is used</h2><p>We use this information to review and respond to enquiries, prepare quotations, discuss project requirements and administer potential or agreed work. We do not publish submitted tender documents.</p>
 <h2>Storage and service providers</h2><p>Our website uses technical hosting and storage providers to process and store enquiry information and uploads. Information may be accessed by people working on the enquiry where necessary.</p>
 <h2>Your choices</h2><p>To ask about the personal information we hold, request correction or deletion, or raise a privacy concern, email <a href="mailto:info@tilespec.uk">info@tilespec.uk</a>. Some information may need to be retained for contractual or legal purposes.</p>
 <h2>Who is responsible for your information</h2><p>TileSPEC is a trading name of <strong>SPEC CONTRACTING LTD</strong>, a company registered in England and Wales (company number <strong>17574891</strong>). The company is responsible for personal information received through TileSPEC enquiries.</p>
 <p>This notice describes the website enquiry process. Additional information about retention periods and service providers may be supplied on request.</p>
 </main>;
}
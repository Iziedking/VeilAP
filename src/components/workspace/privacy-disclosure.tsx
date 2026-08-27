export function PrivacyDisclosure() {
  return (
    <aside id="disclosure" className="disclosure-sheet" aria-labelledby="disclosure-title">
      <div className="sheet-index">PRIVATE<br />WORK<br />03</div>
      <p className="disclosure-code">TRUSTED APPLICATION / STRK20 RELEASE</p>
      <h2 id="disclosure-title">Private records still need an honest boundary.</h2>
      <div className="redaction-sample" aria-hidden="true">
        <span>TERMS</span><i />
        <span>PROOF</span><i className="short" />
        <span>VALUE</span><i />
      </div>
      <div className="disclosure-block concealed">
        <span>A / ENCRYPTED IN VEILAP</span>
        <ul>
          <li>Project brief and acceptance criteria</li>
          <li>Contributor relationship and artifact</li>
          <li>Review record, milestone and royalty terms</li>
        </ul>
      </div>
      <div className="disclosure-block observable">
        <span>B / PUBLIC OR CORRELATABLE</span>
        <ul>
          <li>Pool interaction and timing</li>
          <li>Public deposit or withdrawal legs</li>
          <li>Records either party chooses to disclose</li>
        </ul>
      </div>
      <div className="pool-register">
        <span>STRK20 POOL</span>
        <code>0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a</code>
      </div>
      <p className="disclosure-note">
        Authorized reviewers may receive decrypted evidence. Wallet signing keys and viewing keys stay in the compatible wallet.
      </p>
    </aside>
  );
}

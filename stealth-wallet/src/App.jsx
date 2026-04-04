import { useState } from "react"
import Wallet from "./components/Wallet"
import Send from "./components/Send"
import Assets from "./components/Assets"

function App() {

  const [meta, setMeta] = useState(null)

  return (

    <div style={{ maxWidth: 520, margin: "auto", fontFamily: "Arial" }}>

      <h2>Stealth Wallet</h2>

      <Wallet meta={meta} setMeta={setMeta} />

      {meta && (

        <>

          {/* <Assets meta={meta} />

          <Send meta={meta} /> */}

        </>

      )}

    </div>

  )

}

export default App
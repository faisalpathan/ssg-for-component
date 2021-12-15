import React, { useState } from "react";

import './styles.css'

const App = () => {
  const [count, setCount] = useState(0);
  return (
      <header id="header-root">
        <h1 className="text">Hello world {count}</h1>
        <button className="cta" onClick={() => setCount((currentCount) => currentCount + 1)}>
          Increment count now
        </button>
      </header>
  );
};

export default App;

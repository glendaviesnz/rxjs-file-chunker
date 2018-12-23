import React, { Component } from 'react';
import './App.css';

import FileInput from './FileInput';

class App extends Component {
  render() {
    return (
      <div className="app-container">
        <h1>RxJs File Chunker</h1>
        <FileInput />
      </div>
    );
  }
}

export default App;

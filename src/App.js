import React, { Component } from 'react';
import './App.css';

import FileInput from './FileInput';

class App extends Component {
  render() {
    return (
      <div className="App">
        RxJs File Chunker
        <FileInput />
      </div>
    );
  }
}

export default App;

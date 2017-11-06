import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import HitsChart from './HitsChart.js';
import ServersInfo from './ServersInfo.js';

class App extends Component {
  render() {
    return (
      <div className="App">
        <header className="App-header">
          <h1 className="App-title">MeliProxy Control</h1>
        </header>
        <div className="col-md-4">
          <HitsChart title="Total Hits" dataKey="totalQty" />
        </div>
        <div className="col-md-4">
          <HitsChart title="Ratelimit" dataKey="ratelimitQty" />
        </div>
        <div className="col-md-4">
          <HitsChart title="Not found" dataKey="notfoundQty" />
        </div>
        <div className="col-md-4">
          <HitsChart title="Errors" dataKey="errorQty" />
        </div>
        <div className="col-md-4">
          <HitsChart title="Duration (avg)" dataKey="durationAvg" />
        </div>
        <div className="col-md-4">
          <HitsChart title="Latency (avg)" dataKey="latencyAvg" />
        </div>
        <div className="col-md-12">
          <ServersInfo />
        </div>
      </div>
    );
  }
}

export default App;

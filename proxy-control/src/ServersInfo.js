import React from 'react';
import ReactDOM from 'react-dom';
import { LineChart, Line, XAxis } from 'recharts';
import './ServersInfo.css';
var wrap = require('word-wrap');

class ServersInfo extends React.Component {
  constructor(props) {
    super(props);
    this.state = { servers: null };
  }
  
  componentWillMount() {
    fetch('http://'+window.MELI_PROXY_API_HOST+':7000/api/servers')
    .then(results => {
      return results.json();
    }).then(data => {
      this.setState({ serversJson: JSON.stringify(data) });
    });
  }

  render() {
    return (
      <div>
        <h2>Servers Info</h2>
        <pre>
          {this.state.serversJson ? wrap(this.state.serversJson.replace(/","/g,'", "'),{width: 128}) : "Loading..."}
        </pre>
      </div>
    );
  }
}

export default ServersInfo;

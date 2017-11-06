import React from 'react';
import ReactDOM from 'react-dom';
import { LineChart, Line, XAxis } from 'recharts';
import './HitsChart.css';

class HitsChart extends React.Component {
  constructor(props) {
    super(props);
    this.state = { stats: null };
  }
  
  componentWillMount() {
    fetch('http://'+window.MELI_PROXY_API_HOST+':7000/api/stats')
    .then(results => {
      return results.json();
    }).then(data => {
      this.setState({ stats: data});
    });
  }

  render() {
    return (
      <div>
        <h2>{this.props.title}</h2>
        <LineChart width={300} height={200} data={this.state.stats}>
          <Line type="monotone" dataKey={this.props.dataKey} stroke="#8884d8" />
          <XAxis dataKey="hour" />
        </LineChart>
      </div>
    );
  }
}

export default HitsChart;

import React from 'react';
import { Dimmer, Loader, Grid, Header, Rating, Button, Message, Form, Icon, Segment } from 'semantic-ui-react';
import '../node_modules/semantic-ui-css/semantic.min.css';

var {authoriseApp, readTxInboxData, saveTxInboxData, mintCoin, sendEmail} = require('./storage.js');

export const appInfo = {
  name: 'SAFE Faucet',
  id: 'safe-faucet.bochaco',
  version: '0.0.1',
  vendor: 'bochaco',
  permissions: ["LOW_LEVEL_API"]
};

class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      claimed: false,
      transferred: false,
      rating: -1,
    }

    this.handleRating = this.handleRating.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  componentWillMount() {
    authoriseApp(appInfo);
  }

  handleRating (e, { rating, maxRating }) {
    this.setState({rating: rating})
  }

  handleSubmit(e, { formData }) {
    e.preventDefault();
    this.setState({claimed: true});
    let pk = formData.pk;
    console.log("Minting a coin...", pk);
    let coinId, inbox;
    mintCoin(pk)
      .then(id => coinId = id)
      .then(() => readTxInboxData(pk))
      .then(data => inbox = data)
      .then(() => console.log("Inbox: ", coinId, inbox))
      .then(() => inbox.push({coinId: coinId, msg: 'In exchange of your feedback about SAFE Wallet!', date: (new Date()).toUTCString()}))
      .then(() => console.log("Notifying to recipient's inbox", inbox))
      .then(() => saveTxInboxData(pk, inbox))
      .then(() => console.log("Coin has been transferred"))
      .then(() => sendEmail(this.state.rating, formData.comments, pk))
      .then(() => console.log("Feedback has been sent to safewalletfeedback"))
      .then(() => this.setState({transferred: true}))
  }

  render() {
    return (
      <Grid>
        <Grid.Row>
          <Grid.Column width={4} />
          <Grid.Column width={8}>
            <Segment attached='top' secondary>
              <Header>Welcome to the SAFE Faucet!</Header>
              Get free <b>ThanksCoins</b> by providing feedback about the <a href='safe://safewallet.wow'>SAFE Wallet</a> app.
              Note this is anonymous, so please provide any type of feedback that it'll be very much appreciated.
            </Segment>
            <Form onSubmit={this.handleSubmit} name='mintACoin' className='attached fluid segment'>
              <Grid>
                <Grid.Row>
                  <Grid.Column width={3}>
                    <Header as='h5'>Overall rating</Header>
                  </Grid.Column>
                  <Grid.Column width={4}>
                    <Header as='h5'>
                      <Rating disabled={this.state.claimed} name='rating' maxRating={5} defaultRating={0} icon='star' size='huge' onRate={this.handleRating} />
                    </Header>
                  </Grid.Column>
                  <Grid.Column>
                    {(this.state.rating > 4) && <Icon color='yellow' size='big' name='smile'/>}
                  </Grid.Column>
                </Grid.Row>
              </Grid>
              <br/>
              <Form.Input disabled={this.state.claimed} name='comments' label='Comments / Feedback' placeholder='E.g. I hate the SAFE Wallet app' type='text' />
              <Form.Input disabled={this.state.claimed} name='pk' label='Wallet' placeholder='Public key' type='text' />
              <Button disabled={this.state.claimed} primary>Get free ThanksCoins!</Button>
              { (this.state.claimed && !this.state.transferred) &&
                <Dimmer active inverted>
                  <Loader>One moment please...</Loader>
                </Dimmer>
              }
            </Form>
            {(this.state.claimed && this.state.transferred) &&
              <Message header='Your ThanksCoins have been transfered to your wallet!' attached='bottom' info icon='wizard'
                content='Thanks for your feedback. You can check your balance on the SAFE Wallet.' />
            }
          </Grid.Column>
          <Grid.Column width={4} />
        </Grid.Row>
      </Grid>
    );
  }
}

export default App;
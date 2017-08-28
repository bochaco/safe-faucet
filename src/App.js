import React from 'react';
import { Dimmer, Loader, Grid, Header, Rating, Button, Message, Form, Icon, Segment } from 'semantic-ui-react';
import '../node_modules/semantic-ui-css/semantic.min.css';

var {authoriseApp, sendTxNotif, mintCoin, sendEmail} = require('./storage.js');

export const appInfo = {
  name: 'SAFE Faucet',
  id: 'safe-faucet.bochaco',
  vendor: 'bochaco'
};

const NUMBER_OF_COINS_TO_MINT = 2;
const EMAIL_ID = "safewalletfeedback";
const SAFE_WALLET_URL = 'safe://safewallet.wow';

class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      claimed: false,
      transferred: false,
      rating: -1,
    }

    this.mintCoins = this.mintCoins.bind(this);
    this.handleRating = this.handleRating.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  handleRating (e, { rating, maxRating }) {
    this.setState({rating: rating})
  }

  mintCoins(pk, amount) {
    if (amount < 1) {
      return Promise.resolve([]);
    }
    let id;
    return mintCoin(pk)
      .then((_id) => {
        id = _id;
        console.log("Coin minted at: ", id);
        return this.mintCoins(pk, amount-1);
      })
      .then((ids) => {
        ids.push(id);
        return ids;
      });
  }

  handleSubmit(e, { formData }) {
    e.preventDefault();
    let pk = formData.pk;
    if (pk.length < 1) {
      return;
    }
    this.setState({claimed: true});
    return authoriseApp(appInfo)
      .then(() => {
        console.log(`Minting coins for '${pk}'`);
        return this.mintCoins(pk, NUMBER_OF_COINS_TO_MINT);
      })
      .then((coinIds) => {
        console.log("Notifying coins transfer to recipient's wallet inbox: ", coinIds);
        return sendTxNotif(pk, coinIds);
      })
      .then(() => {
        console.log("Coins transfer was notified");
        return sendEmail(this.state.rating, formData.comments, EMAIL_ID);
      })
      .then(() => {
        console.log(`Feedback has been sent to: '${EMAIL_ID}'`);
        this.setState({transferred: true});
      });
  }

  render() {
    return (
      <Grid>
        <Grid.Row>
          <Grid.Column width={4} />
          <Grid.Column width={8}>
            <Segment attached='top' secondary>
              <Header>Welcome to the SAFE Faucet!</Header>
              Get free <b>ThanksCoins</b> by providing feedback about the <a href={SAFE_WALLET_URL}>SAFE Wallet</a> app.
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
              <Message header={NUMBER_OF_COINS_TO_MINT + ' ThanksCoins have been transferred to your wallet!'} attached='bottom' info icon='wizard'
                content='Thanks for your feedback. You can check your balance on the SAFE Wallet now.' />
            }
          </Grid.Column>
          <Grid.Column width={4} />
        </Grid.Row>
      </Grid>
    );
  }
}

export default App;

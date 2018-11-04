import React from 'react';
import { Image, Dimmer, Loader, Grid, Header, Rating, Button,
        Message, Form, Icon, Segment } from 'semantic-ui-react';
import anita from './anita.png';

var { authoriseApp, fetchRecipientInfo,
      sendTxNotif, mintCoin, sendFeedback } = require('./storage.js');


export const appInfo = {
  name: 'SAFE Faucet',
  id: 'safe-faucet.bochaco',
  vendor: 'bochaco'
};

const NUMBER_OF_COINS_TO_MINT = 6;
const FEEDBACK_FROM_WEBID = 'safe://faucet.thankscoin#me';
const FEEDBACK_TARGET_WEBID = 'safe://feedback.thankscoin#me';
const SAFE_WALLET_URL = 'safe://safewallet.wow';
const PATTER_URL = 'safe://pat.ter/#/profile/feedback.thankscoin';

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

  componentWillMount() {
    authoriseApp(appInfo);
  }

  handleRating (e, { rating, maxRating }) {
    this.setState({rating: rating})
  }

  async mintCoins(pk, amount) {
    if (amount < 1) {
      return Promise.resolve([]);
    }
    const id = await mintCoin(pk);
    console.log("Coin minted at: ", id);
    const ids = await this.mintCoins(pk, amount - 1);
    ids.push(id);
    return ids;
  }

  async handleSubmit(e, { formData }) {
    e.preventDefault();
    try {
      const recipient = await fetchRecipientInfo(formData.recipient);
      const pk = recipient.pk;
      if (pk.length < 1) {
        return;
      }
      this.setState({claimed: true});
      console.log(`Minting coins for '${pk}'`);
      const coinIds = await this.mintCoins(pk, NUMBER_OF_COINS_TO_MINT);
      console.log("Notifying coins transfer to recipient's wallet inbox...");
      await sendTxNotif(recipient, coinIds);
      console.log("Coins transfer was notified");
      await sendFeedback(this.state.rating, formData.comments, FEEDBACK_FROM_WEBID, FEEDBACK_TARGET_WEBID);
      console.log(`Feedback has been sent to: '${FEEDBACK_TARGET_WEBID}'`);
      this.setState({ transferred: true });
    } catch(error) {
      console.error(error);
    }
  }

  render() {
    return (
      <Grid>
        <Grid.Row>
          <Grid.Column width={4} />
          <Grid.Column width={8}>
            <Segment attached='top' secondary>
              <Grid>
                <Grid.Row>
                  <Grid.Column width={2}>
                    <Image src={anita} />
                  </Grid.Column>
                  <Grid.Column width={14} textAlign='left'>
                    <Header>Welcome to the SAFE Faucet!</Header>
                    Get free <b>ThanksCoins</b> by providing feedback about the <a target='_blank' rel='noopener noreferrer' href={SAFE_WALLET_URL}>SAFE Wallet</a> app.
                    Note this is anonymous, so please provide any type of feedback that it'll be very much appreciated.
                    Feedback is sent as posts to <b><i>{FEEDBACK_TARGET_WEBID}</i></b> WebID, you can see them using <a target='_blank' rel='noopener noreferrer' href={PATTER_URL}>Patter social app</a>.
                  </Grid.Column>
                </Grid.Row>
              </Grid>
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
              <Form.Input disabled={this.state.claimed} name='recipient' label='Wallet / Recipient' placeholder='Public key / WebID' type='text' />
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

import React from 'react'
import PropTypes from 'prop-types'
import uuid from 'uuid'
import Slider from 'rc-slider'
import Draggable from 'react-draggable'

import ContentTypes from '../content-types'
import Content from './content'
import { createDocumentLink } from '../share-link'

export default class DecisionContent extends React.PureComponent {
  static propTypes = {
    docId: PropTypes.string.isRequired,
    selfId: PropTypes.string.isRequired
  }

  static initializeDocument(decisionDoc) {
    // Proposals is an object { [proposalId]: { description, nominations } }
    // ... where `nominations` is an object { [nominatedBy]: true }
    decisionDoc.proposals = {}
    // Scores are indexed by user, then by proposal { [userId]: { [proposalId]: score } }
    decisionDoc.scores = {}
    // Muster is indexed by user, with boolean values
    decisionDoc.muster = {}
  }

  static minWidth = 9
  static minHeight = 6
  static defaultWidth = 16
  static defaultHeight = 24
  static maxWidth = 24
  static maxHeight = 36

  state = { proposals: {}, scores: {}, muster: {} }

  // This is the New Boilerplate
  componentWillMount = () => this.refreshHandle(this.props.docId)
  componentWillUnmount = () => this.handle.release()
  componentDidUpdate = (prevProps, prevState, snapshot) => {
    if (prevProps.docId !== this.props.docId) {
      this.refreshHandle(this.props.docId)
    }
  }

  refreshHandle = docId => {
    if (this.handle) {
      this.handle.release()
    }
    this.handle = window.hm.openHandle(docId)
    this.handle.onChange(this.onChange)
  }

  onChange = doc => {
    this.setState({ ...doc })
  }

  handleClickAddIdea = e => {
    this.handle.change(doc => {
      const proposalId = uuid()
      doc.proposals[proposalId] = { description: '', nominations: { [this.props.selfId]: true } }
    })
  }

  handleEditProposal = proposalId => e => {
    this.handle.change(doc => {
      doc.proposals[proposalId].description = e.target.value
    })
  }

  handleClickThumbsUp = proposalId => e => {
    const isMyNomination = Object.keys(this.state.proposals[proposalId].nominations).includes(this.props.selfId)
    if (isMyNomination) {
      this.handle.change(doc => {
        delete doc.proposals[proposalId].nominations[this.props.selfId]
      })
    } else {
      this.handle.change(doc => {
        doc.proposals[proposalId].nominations[this.props.selfId] = true
      })
    }
  }

  handleClickThumbsUpStartVote = e => {
    const isMyMuster = Object.keys(this.state.muster).includes(this.props.selfId)
    if (isMyMuster) {
      this.handle.change(doc => {
        delete doc.muster[this.props.selfId]
      })
    } else {
      this.handle.change(doc => {
        doc.muster[this.props.selfId] = true
      })
    }
  }

  stopPropagation = e => {
    // Don't allow backspace/delete to remove this card
    e.stopPropagation()
  }

  isProposeMode = () => Object.keys(this.state.muster).length < 3

  notionalProposals = () =>
    Object.entries(this.state.proposals).filter(proposal => Object.keys(proposal[1].nominations).length <= 1)

  musteredProposals = () =>
    Object.entries(this.state.proposals).filter(proposal => Object.keys(proposal[1].nominations).length >= 2)

  renderProposals = arrProposals => {
    if (arrProposals.length === 0) {
      return <div style={css.proposalEmptyList}>None</div>
    }
    return arrProposals.map(arrProp => {
      const proposalId = arrProp[0]
      const proposal = arrProp[1]
      const isMyNomination = Object.keys(proposal.nominations).includes(this.props.selfId)
      return (
        <div style={css.proposal} key={proposalId}>
          <div style={css.proposalDescription}>
            <input
              type="text"
              style={css.input}
              value={proposal.description}
              onChange={this.handleEditProposal(proposalId)}
              onKeyDown={this.stopPropagation}
            />
          </div>
          <div style={css.proposalEndorse} onClick={this.handleClickThumbsUp(proposalId)}>
            <i
              className="fa fa-thumbs-up"
              style={Object.assign({}, css.thumbsUp, isMyNomination ? css.thumbsUpMine : {})}
            />
            +{Object.keys(proposal.nominations).length}
          </div>
        </div>
      )
    })
  }

  renderProposeMode = () => {
    const isMyMuster = Object.keys(this.state.muster).includes(this.props.selfId)
    return (
      <React.Fragment>
        <div style={css.addIdeaLine}>
          <button onClick={this.handleClickAddIdea} style={css.addIdeaButton} type="button">
            Add an Idea
          </button>
        </div>
        <div style={css.subtitle}>
          Ideas<div style={css.subtitleGray}>(need 2 endorsements)</div>
        </div>
        <div style={css.proposals}>{this.renderProposals(this.notionalProposals())}</div>
        <div style={css.subtitle}>Proposals</div>
        <div style={css.proposals}>{this.renderProposals(this.musteredProposals())}</div>
        <div style={css.subtitle}>
          Ready to Vote?<div style={css.subtitleGray}>(need 3 to muster a vote)</div>
        </div>
        <div style={css.startVote}>
          <div style={css.startVoteBox} onClick={this.handleClickThumbsUpStartVote}>
            <i
              className="fa fa-thumbs-up"
              style={Object.assign({}, css.thumbsUp, isMyMuster ? css.thumbsUpMine : {})}
            />
            {Object.keys(this.state.muster).length} / 3
          </div>
        </div>
      </React.Fragment>
    )
  }

  renderVoteMode = () => (
    <React.Fragment>
      <div style={css.proposalVoteSpacer} />
      {this.musteredProposals().map(arrProp => {
        const proposalId = arrProp[0]
        const proposal = arrProp[1]
        return (
          <div style={css.proposalVote} key={proposalId}>
            <div style={css.proposalDescription}>{proposal.description}</div>
            <Slider
              defaultValue={0}
              min={0}
              max={100}
              marks={{ 0: 0, 20: 20, 40: 40, 60: 60, 80: 80, 100: 100 }}
              onChange={() => {}}
            />
          </div>
        )
      })}
    </React.Fragment>
  )

  render = () => (
    <div style={css.wrapper} onScroll={this.onScroll}>
      <div style={css.title}>Let's Decide</div>
      {this.isProposeMode() ? this.renderProposeMode() : this.renderVoteMode()}
    </div>
  )

  onScroll = e => {
    e.stopPropagation()
  }
}

const css = {
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    textAlign: 'center',
    margin: '10px 5px',
    paddingBottom: '10px',
    borderBottom: '1px solid #aaa'
  },
  subtitle: {
    fontSize: '14px',
    margin: '10px 15px'
  },
  subtitleGray: {
    fontSize: '12px',
    margin: '12px 5px',
    display: 'inline',
    color: '#999'
  },
  wrapper: {
    border: '1px solid red',
    width: '100%',
    backgroundColor: 'white',
    overflowY: 'scroll'
  },
  addIdeaButton: {
    padding: '5px',
    margin: '5px 15px'
  },
  addIdeaLine: {
    display: 'flex',
    justifyContent: 'center'
  },
  proposals: {},
  proposal: {
    display: 'flex',
    flexWrap: 'nowrap',
    margin: '5px 25px'
  },
  proposalDescription: {
    flexGrow: 1,
    marginRight: '15px'
  },
  proposalEndorse: {
    width: '30px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  },
  proposalEmptyList: {
    fontWeight: 'bold',
    margin: '0 25px'
  },
  thumbsUp: {
    fontSize: '24px',
    color: '#bbb',
    fontWeight: 'bold',
    margin: '0 5px',
    cursor: 'pointer'
  },
  thumbsUpMine: {
    color: '#72c9a0'
  },
  startVote: {
    display: 'flex',
    justifyContent: 'center',
    margin: '30px'
  },
  startVoteBox: {
    border: '2px solid #aaa',
    padding: '5px 15px 5px 5px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer'
  },
  input: {
    width: '100%'
  },

  // Vote Mode
  proposalVoteSpacer: {
    marginTop: '15px'
  },
  proposalVote: {
    margin: '15px 20px 40px 20px'
  }
}

ContentTypes.register({
  component: DecisionContent,
  type: 'decision',
  name: "Let's Decide",
  icon: 'comments'
})

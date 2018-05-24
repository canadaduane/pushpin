import React from 'react'
import PropTypes from 'prop-types'
import { remote } from 'electron'
import Debug from 'debug'
import { ContextMenu, MenuItem as ContextMenuItem, ContextMenuTrigger } from 'react-contextmenu'
import { DraggableCore } from 'react-draggable'
import uuid from 'uuid/v4'
import classNames from 'classNames'

import Loop from '../loop'
import Card from './card'
import ColorPicker from './color-picker'
import * as BoardModel from '../models/board'
import Content from './content'
import ContentTypes from '../content-types'
import { IMAGE_DIALOG_OPTIONS } from '../constants'

const { dialog } = remote

const log = Debug('pushpin:board')
const BOARD_MENU_ID = 'BoardMenu'

// ## Demo data

const WELCOME_TEXT =
`## Welcome

This is our demo board!`

const USAGE_TEXT =
`### Usage

* Double-click to create a new text card.
* Right-click to create a new text or image card.
* Click on a card to edit its text.
* Write Markdown in cards for formatting.
* Click and drag anywhere on a card to move it around.
* Click and drag on the bottom right corner of a card to resize it.
* Paste an absolute file name to an image as the only text in a card + hit enter, to load that file.
* Use arrow keys to scroll around the board.`

const EXAMPLE_TEXT =
`### Example data

We've made some initial cards for you to play with. Have fun!`

const KAY_PATH = './img/kay.jpg'
const WORKSHOP_PATH = './img/carpenters-workshop.jpg'

const withinCard = (card, x, y) => (x >= card.x) &&
         (x <= card.x + card.width) &&
         (y >= card.y) &&
         (y <= card.y + card.height)

const withinAnyCard = (cards, x, y) =>
  Object.values(cards).some((card) => withinCard(card, x, y))

const draggableCards = (cards, selected, card) => {
  if (selected.length > 0 && selected.find(id => id === card.id)) {
    return selected.map(id => cards[id])
  }
  return [card]
}

export default class Board extends React.PureComponent {
  static propTypes = {
    doc: PropTypes.shape({
      backgroundColor: PropTypes.string,
      cards: PropTypes.objectOf(Card.propTypes.card).isRequired
    }).isRequired,
    onChange: PropTypes.func.isRequired
  }

  constructor(props) {
    super(props)
    log('constructor')

    this.onClick = this.onClick.bind(this)
    this.onDoubleClick = this.onDoubleClick.bind(this)
    this.onDragOver = this.onDragOver.bind(this)
    this.onDrop = this.onDrop.bind(this)
    this.onDrag = this.onDrag.bind(this)
    this.onStop = this.onStop.bind(this)
    this.onPaste = this.onPaste.bind(this)
    this.onKeyDown = this.onKeyDown.bind(this)

    this.addContent = this.addContent.bind(this)

    this.onChangeBoardBackgroundColor = this.onChangeBoardBackgroundColor.bind(this)

    this.tracking = {}
    this.state = { cards: {}, selected: [] }
  }

  static initializeDocument(onChange) {
    onChange((b) => {
      b.title = 'No Title'
      b.color = BoardModel.BOARD_COLORS.SKY
      b.authorIds = []
      b.cards = {}
    })
  }

  populateDemoBoard() {
    // TODO: Only the last card is being populated right now
    this.createCard({ type: 'text', x: 150, y: 100, typeAttrs: { text: WELCOME_TEXT } })
    this.createCard({ type: 'text', x: 150, y: 250, typeAttrs: { text: USAGE_TEXT } })
    this.createCard({ type: 'text', x: 150, y: 750, typeAttrs: { text: EXAMPLE_TEXT } })

    // this.setTitle(, { title: 'Example Board' })
    // newState = setBackgroundColor(newState, { backgroundColor: BOARD_COLORS.SKY })

    // newState = addSelfToAuthors(newState)

    // These will be handled async as they require their own IO.
    // Loop.dispatch(ImageCard.importImageThenCreate, { x: 550, y: 500, path: KAY_PATH })
    // Loop.dispatch(ImageCard.importImageThenCreate, { x: 600, y: 150, path: WORKSHOP_PATH })
  }

  componentDidMount() {
    log('componentDidMount')
    if (Object.keys(this.props.doc.cards).length === 0) {
      this.populateDemoBoard()
    }
    document.addEventListener('keydown', this.onKeyDown)
  }

  componentWillUnmount() {
    log('componentWillUnmount')
    document.removeEventListener('keydown', this.onKeyDown)
  }

  onKeyDown(e) {
    if (e.key === 'Backspace') {
      // backspace on the board can't erase a single text card
      if (this.state.selected.length === 1) {
        const card = this.props.doc.cards[this.state.selected[0]]
        if (card && card.type === 'text') {
          return
        }
      }
      BoardModel.cardDeleted(this.props.onChange, this.props.doc, { id: this.state.selected })
    }
  }

  onClick(e) {
    if (!withinAnyCard(this.props.doc.cards, e.pageX, e.pageY)) {
      log('onClick')
      this.setState({ ...this.state, selected: [] })
    }
  }

  onDoubleClick(e) {
    if (!withinAnyCard(this.props.doc.cards, e.pageX, e.pageY)) {
      log('onDoubleClick')
      const textType = ContentTypes.list().find((t) => t.type === 'text')
      Loop.dispatch(BoardModel.addCard, { x: e.pageX, y: e.pageY, contentType: textType, selected: true })
    }
  }

  onDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
  }

  getFiles(dataTransfer) {
    const files = []
    for (let i = 0; i < dataTransfer.files.length; i += 1) {
      const item = dataTransfer.items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }

    return files
  }

  async onDrop(e) {
    log('onDrop')
    e.preventDefault()
    e.stopPropagation()
    const { pageX, pageY } = e

    /* Adapted from:
      https://www.meziantou.net/2017/09/04/upload-files-and-directories-using-an-input-drag-and-drop-or-copy-and-paste-with */
    const { length } = e.dataTransfer.files
    for (let i = 0; i < length; i += 1) {
      const entry = e.dataTransfer.files[i]
      const reader = new FileReader()

      if (entry.type.match('image/')) {
        reader.onload = () =>
          Loop.dispatch(ImageCard.importImageThenCreate, {
            path: entry.name,
            buffer: Buffer.from(reader.result),
            x: pageX + (i * (BoardModel.GRID_SIZE * 2)),
            y: pageY + (i * (BoardModel.GRID_SIZE * 2)) })
        reader.readAsArrayBuffer(entry)
      } else if (entry.type.match('text/')) {
        reader.onload = () => {
          const textType = ContentTypes.list().find((t) => t.type === 'text')
          Loop.dispatch(BoardModel.addCard, {
            x: pageX + (i * (BoardModel.GRID_SIZE * 2)),
            y: pageY + (i * (BoardModel.GRID_SIZE * 2)),
            contentType: textType,
            args: { text: reader.readAsText(entry) },
            selected: true
          })
        }
      }
    }
    if (length > 0) { return }

    // If we can't get the item as a bunch of files, let's hope it works as plaintext.
    const plainText = e.dataTransfer.getData('text/plain')
    if (plainText) {
      const textType = ContentTypes.list().find((t) => t.type === 'text')
      Loop.dispatch(BoardModel.addCard, {
        x: pageX,
        y: pageY,
        contentType: textType,
        args: { text: plainText },
        selected: true
      })
    }
  }

  /* We can't get the mouse position on a paste event,
     so we ask the window for the current pageX/Y offsets and just stick the new card
     100px in from there. */
  async onPaste(e) {
    log('onPaste')
    e.preventDefault()
    e.stopPropagation()

    const x = window.pageXOffset + 100
    const y = window.pageYOffset + 100

    const dataTransfer = e.clipboardData
    // Note that the X/Y coordinates will all be the same for these cards,
    // and the chromium code supports that... but I can't think of it could happen,
    // so if you're reading this because it did, sorry!
    if (dataTransfer.files.length > 0) {
      Array.from(dataTransfer.files).forEach((file, i) => {
        // make sure we have an image
        if (!file.type.match('image/')) {
          log(`we had a pasted file that was a ${file.type} not an image`)
          return
        }

        const reader = new FileReader()
        reader.onload = () =>
          Loop.dispatch(ImageCard.importImageThenCreate, {
            path: file.name,
            buffer: Buffer.from(reader.result),
            x,
            y })
        reader.readAsArrayBuffer(file)
      })
    }

    const plainTextData = dataTransfer.getData('text/plain')
    if (plainTextData) {
      const textType = ContentTypes.list().find((t) => t.type === 'text')
      Loop.dispatch(BoardModel.addCard, { x, y, contentType: textType, args: { text: plainTextData }, selected: true })
    }
  }

  addContent(e, contentType) {
    const x = e.pageX
    const y = e.pageY

    if (contentType.type !== 'image') {
      this.createCard({ x, y, type: contentType.type, typeAttrs: { text: ''} })
      return
    }

    dialog.showOpenDialog(IMAGE_DIALOG_OPTIONS, (paths) => {
      // User aborted.
      if (!paths) {
        return
      }
      if (paths.length !== 1) {
        throw new Error('Expected exactly one path?')
      }
      const path = paths[0]
      this.createCard({ x, y, type: 'image', typeAttrs: { path }})
    })
  }

  createCard({ x, y, width, height, type, typeAttrs }) {
    const id = uuid()
    const docId = Content.initializeContentDoc(type, typeAttrs)

    this.props.onChange((b) => {
      const snapX = BoardModel.snapCoordinateToGrid(x)
      const snapY = BoardModel.snapCoordinateToGrid(y)
      const newCard = {
        id,
        type,
        docId,
        x: snapX,
        y: snapY,
        width: BoardModel.snapMeasureToGrid(width || BoardModel.CARD_DEFAULT_WIDTH),
        height: BoardModel.snapMeasureToGrid(height || BoardModel.CARD_DEFAULT_HEIGHT),
        slackWidth: 0,
        slackHeight: 0,
        resizing: false,
        moving: false,
      }
      b.cards[id] = newCard
    })
  }

  onChangeBoardBackgroundColor(color) {
    log('onChangeBoardBackgroundColor')
    BoardModel.newSetBackgroundColor(
      this.props.onChange,
      this.props.doc,
      { backgroundColor: color.hex }
    )
  }

  // Copy view-relevant move/resize state over to React.
  setDragState(card, tracking) {
    const cards = { ...this.state.cards }

    cards[card.id] = {
      moveX: tracking.moveX,
      moveY: tracking.moveY,
      resizeWidth: tracking.resizeWidth,
      resizeHeight: tracking.resizeHeight
    }

    this.setState({ cards })
  }

  effectDrag(card, tracking, { deltaX, deltaY }) {
    if (!tracking.resizing && !tracking.moving) {
      throw new Error('Did not expect drag without resize or move')
    }
    if (tracking.resizing && tracking.moving) {
      throw new Error('Did not expect drag with both resize and move')
    }

    if ((deltaX === 0) && (deltaY === 0)) {
      return
    }

    tracking.totalDrag = tracking.totalDrag + Math.abs(deltaX) + Math.abs(deltaY)

    if (tracking.moving) {
      // First guess at change in location given mouse movements.
      const preClampX = tracking.moveX + deltaX
      const preClampY = tracking.moveY + deltaY

      // Add slack to the values used to calculate bound position. This will
      // ensure that if we start removing slack, the element won't react to
      // it right away until it's been completely removed.
      let newX = preClampX + tracking.slackX
      let newY = preClampY + tracking.slackY

      // Clamp to ensure card doesn't move beyond the board.
      newX = Math.max(newX, 0)
      newX = Math.min(newX, BoardModel.BOARD_WIDTH - card.width)
      tracking.moveX = newX
      newY = Math.max(newY, 0)
      newY = Math.min(newY, BoardModel.BOARD_HEIGHT - card.height)
      tracking.moveY = newY

      // If the numbers changed, we must have introduced some slack.
      // Record it for the next iteration.
      tracking.slackX = tracking.slackX + preClampX - newX
      tracking.slackY = tracking.slackY + preClampY - newY
    }

    if (tracking.resizing) {
      // First guess at change in dimensions given mouse movements.
      let preClampWidth = tracking.resizeWidth + deltaX
      let preClampHeight = tracking.resizeHeight + deltaY

      // Maintain aspect ratio on image cards.
      if (card.type === 'image') {
        const ratio = tracking.resizeWidth / tracking.resizeHeight
        preClampHeight = preClampWidth / ratio
        preClampWidth = preClampHeight * ratio
      }

      // Add slack to the values used to calculate bound position. This will
      // ensure that if we start removing slack, the element won't react to
      // it right away until it's been completely removed.
      let newWidth = preClampWidth + tracking.slackWidth
      let newHeight = preClampHeight + tracking.slackHeight

      // Clamp to ensure card doesn't resize beyond the board or min dimensions.
      newWidth = Math.max(BoardModel.CARD_MIN_WIDTH, newWidth)
      newWidth = Math.min(BoardModel.BOARD_WIDTH - card.x, newWidth)
      tracking.resizeWidth = newWidth
      newHeight = Math.max(BoardModel.CARD_MIN_HEIGHT, newHeight)
      newHeight = Math.min(BoardModel.BOARD_HEIGHT - card.y, newHeight)
      tracking.resizeHeight = newHeight

      // If the numbers changed, we must have introduced some slack.
      // Record it for the next iteration.
      tracking.slackWidth = tracking.slackWidth + preClampWidth - newWidth
      tracking.slackHeight = tracking.slackHeight + preClampHeight - newHeight
    }
  }

  onDrag(card, e, d) {
    log('onDrag')
    e.preventDefault()
    e.stopPropagation()

    const tracking = this.tracking[card.id]

    // If we haven't started tracking this drag, initialize tracking
    if (!(tracking && (tracking.moving || tracking.resizing))) {
      const resizing = e.target.className === 'cardResizeHandle'
      const moving = !resizing

      if (moving) {
        const cards = draggableCards(this.props.doc.cards, this.state.selected, card)

        cards.forEach(c => {
          this.tracking[c.id] = {
            moveX: c.x,
            moveY: c.y,
            slackX: 0,
            slackY: 0,
            totalDrag: 0,
            moving: true
          }
        })
      }

      if (resizing) {
        this.tracking[card.id] = {
          resizing: true,
          slackWidth: 0,
          slackHeight: 0,
          resizeWidth: card.width,
          resizeHeight: card.height
        }
      }

      return
    }

    if (tracking.moving) {
      const cards = draggableCards(this.props.doc.cards, this.state.selected, card)
      cards.forEach(card => {
        const t = this.tracking[card.id]
        this.effectDrag(card, t, d)
        this.setDragState(card, t)
      })
    }

    if (tracking.resizing) {
      this.effectDrag(card, tracking, d)
      this.setDragState(card, tracking)
    }
  }

  onStop(card, e, d) {
    log('onStop')

    const { id } = card
    const { selected } = this.state
    const tracking = this.tracking[id]

    // If tracking is not initialized, treat this as a click
    if (!(tracking && (tracking.moving || tracking.resizing))) {
      if (e.ctrlKey || e.shiftKey) {
        if (selected.includes(card.id)) {
          // remove from the current state if we have it
          this.setState({ ...this.state,
            selected: selected.filter((filterId) => filterId !== id) })
        } else {
          // add to the current state if we don't
          this.setState({ ...this.state, selected: [...selected, id] })
        }
      } else {
        // otherwise we don't have shift/ctrl, so just set selection to this
        this.setState({ ...this.state, selected: [card.id] })
      }

      return
    }

    if (tracking.moving) {
      const cards = draggableCards(this.props.doc.cards, this.state.selected, card)
      cards.forEach(card => {
        const t = this.tracking[card.id]
        const x = t.moveX
        const y = t.moveY

        t.moveX = null
        t.moveY = null
        t.slackX = null
        t.slackY = null
        t.moving = false
        t.totalDrag = null

        BoardModel.cardMoved(this.props.onChange, this.props.doc, { id: card.id, x, y })
        this.setDragState(card, t)
      })
    }

    if (tracking.resizing) {
      const width = tracking.resizeWidth
      const height = tracking.resizeHeight

      tracking.resizeWidth = null
      tracking.resizeHeight = null
      tracking.slackWidth = null
      tracking.slackHeight = null
      tracking.resizing = false
      tracking.totalDrag = null

      BoardModel.cardResized(this.props.onChange, this.props.doc, { id: card.id, width, height })
      this.setDragState(card, tracking)
    }
  }

  render() {
    log('render')

    const cards = this.props.doc.cards || {}
    // rework selected functioning, this is a slow implementation
    const cardChildren = Object.entries(cards).map(([id, card]) => {
      const selected = this.state.selected.includes(id)
      const uniquelySelected = selected && this.state.selected.length === 1
      return (
        <DraggableCore
          key={id}
          allowAnyClick={false}
          disabled={false}
          enableUserSelectHack={false}
          onDrag={(e, d) => this.onDrag(card, e, d)}
          onStop={(e, d) => this.onStop(card, e, d)}
        >
          <div>
            <Card
              card={card}
              dragState={this.state.cards[id] || {}}
              selected={selected}
              uniquelySelected={uniquelySelected}
            />
          </div>
        </DraggableCore>
      )
    })

    // We should optimize to avoid creating a new function for onClick each render.
    const createMenuItems = ContentTypes.list().map((contentType) => {
      return (
        <ContextMenuItem onClick={(e) => { this.addContent(e, contentType) }}>
          <div className="ContextMenu__iconBounding ContextMenu__iconBounding--note">
            <i className={classNames('fa', `fa-${contentType.icon}`)} />
          </div>
          <span className="ContextMenu__label">{contentType.name}</span>
        </ContextMenuItem>
      )
    })

    const contextMenu = (
      <ContextMenu id={BOARD_MENU_ID} className="ContextMenu">

        <div className="ContextMenu__section">
          { createMenuItems }
        </div>

        <div className="ContextMenu__divider" />

        <div className="ContextMenu__section">
          <ContextMenuItem>
            <ColorPicker
              color={this.props.doc.backgroundColor}
              colors={Object.values(BoardModel.BOARD_COLORS)}
              onChangeComplete={this.onChangeBoardBackgroundColor}
            />
          </ContextMenuItem>
        </div>
      </ContextMenu>
    )

    return (
      <div>
        { contextMenu }
        <ContextMenuTrigger holdToDisplay={-1} id={BOARD_MENU_ID}>
          <div
            id="board"
            className="board"
            ref={(e) => { this.boardRef = e }}
            style={{ backgroundColor: this.props.doc.backgroundColor }}
            onClick={this.onClick}
            onDoubleClick={this.onDoubleClick}
            onDragOver={this.onDragOver}
            onDrop={this.onDrop}
            onPaste={this.onPaste}
            role="presentation"
          >
            {cardChildren}
          </div>
        </ContextMenuTrigger>
      </div>
    )
  }
}

ContentTypes.register({
  component: Board,
  type: 'board',
  name: 'Board',
  icon: 'sticky-note'
})

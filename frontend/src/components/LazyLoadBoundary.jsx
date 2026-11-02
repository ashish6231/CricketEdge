import { Component } from 'react'

export default class LazyLoadBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div role="alert" className="ui-empty-state">
      <p>This part of the page could not load. Please check your connection.</p>
      <button type="button" className="ui-button ui-button-secondary" onClick={() => window.location.reload()}>Reload page</button>
    </div>
    return this.props.children
  }
}

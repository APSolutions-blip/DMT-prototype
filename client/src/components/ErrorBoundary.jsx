import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('UI error boundary caught:', error, info)
  }

  reset = () => this.setState({ error: null })

  reload = () => window.location.reload()

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-md text-center">
          <div className="text-5xl mb-2">😵</div>
          <h1 className="text-2xl font-black text-red-600">Something broke</h1>
          <p className="text-gray-500 text-sm mt-2">
            The app hit an unexpected error. No data has been lost — reload to continue.
          </p>
          <pre className="bg-gray-50 text-xs text-gray-600 rounded-xl p-3 mt-4 text-left overflow-auto max-h-32">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="flex gap-2 mt-4">
            <button onClick={this.reset}
              className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl">
              Try Again
            </button>
            <button onClick={this.reload}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl">
              Reload App
            </button>
          </div>
        </div>
      </div>
    )
  }
}

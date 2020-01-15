/**
 * @module PullLoader
 * @author nuintun
 * @license MIT
 * @see https://github.com/Broltes/react-touch-loader
 */

import styles from './index.module.less';

import React from 'react';
import propTypes from 'prop-types';
import classNames from 'classnames';
import memoizeOne from 'memoize-one';

const STATS = {
  INIT: styles.stateInit,
  RESET: styles.stateReset,
  LOADING: styles.stateLoading,
  PULLING: styles.statePulling,
  REFRESHED: styles.stateRefreshed,
  REFRESHING: styles.stateRefreshing,
  ENOUGH: `${styles.statePulling} ${styles.enough}`
};

export const PROGRESS = {
  DISABLE: 0,
  START: 1,
  DONE: 2
};

// 拖拽的缓动公式 - easeOutSine
function easing(distance) {
  // Current time
  const t = distance;
  // BegInnIng value
  const b = 0;
  // Duration
  // 允许拖拽的最大距离
  const d = window.screen.availHeight;
  // Change In value
  // 提示标签最大有效拖拽距离
  const c = d / 2.5;

  return c * Math.sin((t / d) * (Math.PI / 2)) + b;
}

// Test via a getter in the options object to see
// if the passive property is accessed
let supportsPassive = false;

try {
  const options = Object.defineProperty({}, 'passive', {
    get: () => (supportsPassive = true)
  });

  window.addEventListener('test', null, options);
} catch (e) {
  // Do nothing
}

const willPreventDefault = supportsPassive ? { passive: false } : false;

// Pull to refresh
// Tap bottom to load more
export default class PullLoader extends React.PureComponent {
  static defaultProps = {
    overscan: 1,
    autoLoadMore: true,
    scrollThreshold: 0,
    refreshThreshold: 72,
    progress: PROGRESS.DISABLE
  };

  /**
   * @property propTypes
   */
  static propTypes = {
    hasMore: propTypes.bool,
    onRefresh: propTypes.func,
    overscan: propTypes.number,
    onLoadMore: propTypes.func,
    autoLoadMore: propTypes.bool,
    data: propTypes.array.isRequired,
    scrollThreshold: propTypes.number,
    refreshThreshold: propTypes.number,
    children: propTypes.func.isRequired,
    rowHeight: propTypes.number.isRequired,
    progress: propTypes.oneOf([PROGRESS.DISABLE, PROGRESS.START, PROGRESS.DONE])
  };

  state = {
    range: [0, 0],
    pullHeight: 0,
    status: STATS.INIT
  };

  initialTouch = {
    clientY: 0,
    scrollTop: 0
  };

  viewportRef = React.createRef();

  bodyRef = React.createRef();

  getVisibleRange() {
    const { viewportRef } = this;
    const { rowHeight, overscan } = this.props;

    const viewport = viewportRef.current;
    const scrollHeight = viewport.scrollTop;
    const containerHeight = viewport.clientHeight;

    const start = Math.max(0, Math.floor(scrollHeight / rowHeight) - overscan);
    const end = start + Math.ceil(containerHeight / rowHeight) + overscan + 1;

    return [start, end];
  }

  updateRange() {
    const { range } = this.state;
    const [prevStart, prevEnd] = range;
    const [start, end] = this.getVisibleRange();

    if (start !== prevStart || end !== prevEnd) {
      this.setState({ range: [start, end] });
    }
  }

  getVisibleItems = memoizeOne((data, start, end) => {
    return data.slice(start, end);
  });

  getClassName() {
    const { status } = this.state;
    const { className, progress } = this.props;

    return classNames(className, styles.pLoader, status, {
      [styles.pLoaderProgress]: progress !== PROGRESS.DISABLE,
      [styles.progressCompleted]: progress === PROGRESS.DONE
    });
  }

  getBodyStyle() {
    const { data, rowHeight } = this.props;
    const { range, pullHeight } = this.state;

    const [start] = range;
    const boxSizing = 'border-box';
    const paddingTop = start * rowHeight;
    const minHeight = data.length * rowHeight;

    if (pullHeight) {
      const transform = `translate3d(0, ${pullHeight}px, 0)`;

      return { boxSizing, paddingTop, minHeight, transform };
    }

    return { boxSizing, paddingTop, minHeight };
  }

  getSymbolStyle() {
    const { pullHeight } = this.state;

    if (pullHeight) {
      const height = Math.max(48, pullHeight);

      return { height, lineHeight: `${height}px` };
    }

    return null;
  }

  canLoad() {
    const { status } = this.state;

    return status !== STATS.REFRESHING && status !== STATS.LOADING;
  }

  canLoadMore() {
    const { hasMore, onLoadMore } = this.props;

    return hasMore && onLoadMore && this.canLoad();
  }

  canRefresh() {
    const { onRefresh } = this.props;

    return onRefresh && this.canLoad();
  }

  calculateDistance(touch) {
    return touch.clientY - this.initialTouch.clientY;
  }

  loadMore = () => {
    this.setState({ status: STATS.LOADING });
    this.props.onLoadMore(() => this.setState({ status: STATS.INIT }));
  };

  onTouchStart = e => {
    if (this.canRefresh() && e.touches.length === 1) {
      const { scrollTop } = this.viewportRef.current;

      this.initialTouch = { scrollTop, clientY: e.touches[0].clientY };
    }
  };

  onTouchMove = e => {
    if (e.cancelable && this.canRefresh()) {
      const { refreshThreshold } = this.props;
      const { scrollTop } = this.viewportRef.current;
      const distance = this.calculateDistance(e.touches[0]);

      if (distance > 0 && scrollTop <= 0) {
        let pullDistance = distance - this.initialTouch.scrollTop;

        if (pullDistance < 0) {
          // 修复 webview 滚动过程中 touchstart 时计算 viewport.scrollTop 不准
          pullDistance = 0;

          this.initialTouch.scrollTop = distance;
        }

        const pullHeight = easing(pullDistance);

        // 减弱滚动
        pullHeight && e.preventDefault();

        this.setState({ pullHeight, status: pullHeight >= refreshThreshold ? STATS.ENOUGH : STATS.PULLING });
      }
    }
  };

  onTouchEnd = () => {
    if (this.canRefresh()) {
      if (this.state.status === STATS.ENOUGH) {
        // Refreshing
        this.setState({ pullHeight: 0, status: STATS.REFRESHING });
      } else if (!this.viewportRef.current.scrollTop) {
        // Reset
        this.setState({ pullHeight: 0, status: STATS.RESET });
      } else {
        this.setState({ pullHeight: 0, status: STATS.INIT });
      }
    }
  };

  onScroll = () => {
    this.updateRange();

    const { autoLoadMore, scrollThreshold } = this.props;

    if (autoLoadMore && this.canLoadMore()) {
      const viewport = this.viewportRef.current;
      const scrollBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

      scrollBottom <= scrollThreshold && this.loadMore();
    }
  };

  onTransitionEnd = e => {
    // Only body self transition can trigger events
    if (e.target === this.bodyRef.current) {
      switch (this.state.status) {
        // Trigger refresh action
        case STATS.REFRESHING:
          this.props.onRefresh(
            () => {
              this.setState({ pullHeight: 0, status: STATS.REFRESHED });
              // Close success message after 300ms
              setTimeout(() => this.setState({ status: STATS.INIT }), 300);
            },
            () => this.setState({ pullHeight: 0, status: STATS.RESET })
          );
          break;
        case STATS.RESET:
          this.setState({ status: STATS.INIT });
          break;
      }
    }
  };

  componentDidMount() {
    const { viewportRef } = this;
    const { autoLoadMore } = this.props;

    autoLoadMore && this.canLoadMore() && this.loadMore();

    this.initialTouch.scrollTop = viewportRef.current.scrollTop;

    viewportRef.current.addEventListener('touchstart', this.onTouchStart, willPreventDefault);
    viewportRef.current.addEventListener('touchmove', this.onTouchMove, willPreventDefault);
    viewportRef.current.addEventListener('touchend', this.onTouchEnd, willPreventDefault);
    viewportRef.current.addEventListener('touchcancel', this.onTouchEnd, willPreventDefault);

    this.updateRange();
  }

  componentWillUnmount() {
    const { viewportRef } = this;

    viewportRef.current.removeEventListener('touchstart', this.onTouchStart);
    viewportRef.current.removeEventListener('touchmove', this.onTouchMove);
    viewportRef.current.removeEventListener('touchend', this.onTouchEnd);
    viewportRef.current.removeEventListener('touchcancel', this.onTouchEnd);
  }

  render() {
    const { range } = this.state;
    const { data, style, children, hasMore } = this.props;

    const [start, end] = range;

    return (
      <div style={style} className={this.getClassName()}>
        <div ref={this.viewportRef} onScroll={this.onScroll} className={styles.pLoaderScroller}>
          <div className={styles.pLoaderSymbol} style={this.getSymbolStyle()}>
            <div className={styles.pLoaderMsg}>
              <i />
            </div>
            <div className={styles.pLoaderLoading}>
              <i className={styles.spinning} />
            </div>
          </div>
          <div
            ref={this.bodyRef}
            style={this.getBodyStyle()}
            className={styles.pLoaderBody}
            onTransitionEnd={this.onTransitionEnd}
          >
            {this.getVisibleItems(data, start, end).map(children)}
          </div>
          {hasMore && (
            <div className={styles.pLoaderFooter}>
              <div className={styles.pLoaderBtn} onClick={this.loadMore} />
              <div className={styles.pLoaderLoading}>
                <i className={styles.spinning} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}

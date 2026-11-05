import React from "react";
import { Button, Result } from "antd";
import { isStaleChunkError, reloadForNewBuild } from "../utils/staleBuild";

interface Props {
  children: React.ReactNode;
  // A change (the next page) clears a caught failure.
  resetKey?: string;
}

interface State {
  failed: boolean;
  error: unknown;
}

/**
 * Catches a lazily loaded page whose chunk the last deploy replaced
 * (utils/staleBuild.ts) and offers a reload in its place, instead of the
 * whole app going blank. Any other error is rethrown from render, which hands
 * it to whatever is above, so it behaves exactly as it did without this
 * boundary.
 */
class StaleChunkBoundary extends React.Component<Props, State> {
  state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, error };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false, error: null });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (!isStaleChunkError(this.state.error)) throw this.state.error;
    return (
      <Result
        status="warning"
        title="ระบบเพิ่งอัปเดต"
        subTitle="หน้านี้จะเปิดได้หลังจากรีเฟรช ถ้ามีงานค้างอยู่ในแท็บอื่น ให้บันทึกก่อน"
        extra={
          <Button type="primary" onClick={reloadForNewBuild}>
            รีเฟรช
          </Button>
        }
      />
    );
  }
}

export default StaleChunkBoundary;

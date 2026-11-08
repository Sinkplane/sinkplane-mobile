import ExpoModulesCore
import UIKit

private let postureEvent = "onPostureChange"

/**
 Reports the hinge state of foldable iPhones through `UIHingeInteraction` (iOS 27.1+). UIKit
 exposes the hinge's status and angle but not its position, so `orientation` and `bounds` are
 left out and JS infers them from the window (see `src/hooks/use-fold-posture.ts`).
 */
public class FoldPostureModule: Module {
  private var latest: [String: Any]?
  private var interaction: AnyObject?
  private weak var hostWindow: UIWindow?

  public func definition() -> ModuleDefinition {
    Name("FoldPosture")

    Events(postureEvent)

    Function("getPosture") { () -> [String: Any]? in
      return self.latest
    }

    OnStartObserving(postureEvent) {
      DispatchQueue.main.async { self.start() }
    }

    OnStopObserving(postureEvent) {
      DispatchQueue.main.async { self.stop() }
    }

    OnDestroy {
      DispatchQueue.main.async { self.stop() }
    }
  }

  private func keyWindow() -> UIWindow? {
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }

  private func start() {
    guard interaction == nil, let window = keyWindow() else { return }
    if #available(iOS 27.1, *) {
      let hinge = UIHingeInteraction { [weak self] _, update in
        self?.publish(update.hinge)
      }
      window.addInteraction(hinge)
      interaction = hinge
      hostWindow = window
    }
  }

  private func stop() {
    if #available(iOS 27.1, *), let hinge = interaction as? UIHingeInteraction {
      hostWindow?.removeInteraction(hinge)
    }
    interaction = nil
    hostWindow = nil
  }

  @available(iOS 27.1, *)
  private func publish(_ hinge: UIHinge?) {
    latest = hinge.flatMap(Self.posture)
    sendEvent(postureEvent, ["posture": latest as Any])
  }

  /// Folded shut (the app is on the outer screen) or an unknown hinge has no posture to adapt to.
  @available(iOS 27.1, *)
  private static func posture(_ hinge: UIHinge) -> [String: Any]? {
    let state: String
    switch hinge.status {
    case .partiallyOpen: state = "halfOpened"
    case .fullyOpen: state = "flat"
    default: return nil
    }
    return ["state": state, "angle": Double(hinge.angle)]
  }
}

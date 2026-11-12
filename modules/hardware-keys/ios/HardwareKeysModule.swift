import ExpoModulesCore
import UIKit

/**
 React Native doesn't deliver hardware keyboard presses to JS on iOS, so the player mounts this
 invisible view: it makes itself first responder and reports the space bar.
 */
public class HardwareKeysModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HardwareKeys")

    View(SpaceKeyView.self) {
      Events("onSpace")

      Prop("active") { (view, active: Bool?) in
        view.active = active ?? true
      }
    }
  }
}

/**
 Takes first responder whenever it (re)enters a window, the app comes back to the foreground, or
 `active` turns on again (after a modal took the keyboard). Only an unmodified space press is
 consumed; everything else continues up the responder chain.
 */
public final class SpaceKeyView: ExpoView {
  let onSpace = EventDispatcher()

  var active = true {
    didSet {
      if active && !oldValue { claimKeyboard() }
    }
  }

  private var becameActiveObserver: NSObjectProtocol?

  public required init(appContext: AppContext? = nil) {
    // Not `isUserInteractionEnabled = false`: that also drops press (keyboard) events.
    super.init(appContext: appContext)
    becameActiveObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.claimKeyboard()
    }
  }

  deinit {
    if let becameActiveObserver {
      NotificationCenter.default.removeObserver(becameActiveObserver)
    }
  }

  public override var canBecomeFirstResponder: Bool { active }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    claimKeyboard()
  }

  private func claimKeyboard() {
    // After the current layout pass: a view can't become first responder mid-insertion.
    DispatchQueue.main.async { [weak self] in
      guard let self, self.active, self.window != nil, !self.isFirstResponder else { return }
      self.becomeFirstResponder()
    }
  }

  private func isSpace(_ press: UIPress) -> Bool {
    guard let key = press.key else { return false }
    let modifiers: UIKeyModifierFlags = [.command, .control, .alternate, .shift]
    return key.keyCode == .keyboardSpacebar && key.modifierFlags.intersection(modifiers).isEmpty
  }

  public override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    let spaces = presses.filter(isSpace)
    if !spaces.isEmpty {
      onSpace()
    }
    let others = presses.subtracting(spaces)
    if !others.isEmpty {
      super.pressesBegan(others, with: event)
    }
  }

  public override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    let others = presses.filter { !isSpace($0) }
    if !others.isEmpty {
      super.pressesEnded(Set(others), with: event)
    }
  }

  public override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    let others = presses.filter { !isSpace($0) }
    if !others.isEmpty {
      super.pressesCancelled(Set(others), with: event)
    }
  }
}

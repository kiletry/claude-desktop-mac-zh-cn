import CoreGraphics

let window = CGRect(x: 100, y: 200, width: 1_000, height: 700)
let screen = CGRect(x: 0, y: 0, width: 1_440, height: 900)

precondition(OCRZonePolicy.permits(
    frame: CGRect(x: 120, y: 420, width: 180, height: 24),
    in: window
))
precondition(OCRZonePolicy.permits(
    frame: CGRect(x: 560, y: 825, width: 180, height: 24),
    in: window
))
precondition(!OCRZonePolicy.permits(
    frame: CGRect(x: 500, y: 460, width: 240, height: 28),
    in: window
))

let mapped = OCRCoordinateMapper.screenFrame(
    observation: CGRect(x: 0.2, y: 0.6, width: 0.1, height: 0.05),
    in: window,
    screen: screen
)
precondition(mapped == CGRect(x: 300, y: 420, width: 100, height: 35))

let overlay = OverlayPanel(overlayLabel: .init(text: "新建", frame: CGRect(x: 10, y: 10, width: 80, height: 24)))
precondition(!overlay.hidesOnDeactivate)

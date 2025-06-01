import UIKit

class ViewController: UIViewController {
    
    @IBOutlet weak var welcomeLabel: UILabel!
    @IBOutlet weak var scheduleButton: UIButton!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }
    
    private func setupUI() {
        welcomeLabel.text = "Welcome to SkedAI Mobile"
        welcomeLabel.font = UIFont.boldSystemFont(ofSize: 24)
        welcomeLabel.textAlignment = .center
        
        scheduleButton.setTitle("View Schedule", for: .normal)
        scheduleButton.backgroundColor = .systemBlue
        scheduleButton.layer.cornerRadius = 8
        scheduleButton.setTitleColor(.white, for: .normal)
    }
    
    @IBAction func scheduleButtonTapped(_ sender: UIButton) {
        print("Schedule button tapped")
    }
}
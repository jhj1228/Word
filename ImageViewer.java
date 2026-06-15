import javax.swing.*;
import javax.swing.event.ChangeEvent;
import javax.swing.event.ChangeListener;
import java.awt.event.*;
import java.awt.*;
import java.awt.image.*;
import java.awt.color.ColorSpace;
import java.awt.image.BufferedImage;
import java.awt.image.ColorConvertOp;


public class ImageViewer extends JFrame {

	private JLabel imagelabel;
	private JLabel desclabel;

	private int panelwidth;
	private int panelheight;
	private ImageIcon originalIcon;
	private Image originalImage;
	private Image currentImage;

	public ImageViewer() {
		setTitle("ImageViewer");
		Container c = getContentPane();
		c.setLayout(new BorderLayout());
		setSize(800, 600);

		JPanel leftpanel = new JPanel();
		leftpanel.setLayout(new BorderLayout());
		imagelabel = new JLabel();
		imagelabel.setHorizontalAlignment(JLabel.CENTER);
		imagelabel.setVerticalAlignment(JLabel.CENTER);
		leftpanel.add(imagelabel, BorderLayout.CENTER);

		JPanel rightpanel = new JPanel();
		rightpanel.setPreferredSize(new Dimension(250, 0));
		rightpanel.setBackground(Color.LIGHT_GRAY);
		rightpanel.setLayout(new FlowLayout(FlowLayout.CENTER, 10, 10));

		c.add(leftpanel, BorderLayout.CENTER);
		c.add(rightpanel, BorderLayout.EAST);

		// 이미지 크기 조절 (마우스 휠로 조작)
		imagelabel.addMouseWheelListener(new MouseWheelListener() {
			public void mouseWheelMoved(MouseWheelEvent e) {
				if (originalIcon == null)
					return;

				int notches = e.getWheelRotation();
				int delta = 10;
				if (notches < 0) {
					panelwidth += delta;
					panelheight += delta;
				} else {
					panelwidth = Math.max(20, panelwidth - delta);
					panelheight = Math.max(20, panelheight - delta);
				}

				Image img = originalIcon.getImage();
				Image scaledImg = img.getScaledInstance(panelwidth, panelheight, Image.SCALE_SMOOTH);

				imagelabel.setIcon(new ImageIcon(scaledImg));
				imagelabel.setBounds(imagelabel.getX(), imagelabel.getY(), panelwidth, panelheight);
			}
		});

		// 불러온 파일 디렉토리 주소
		desclabel = new JLabel("주소");
		rightpanel.add(desclabel);

		// 이미지 밝기 조절 (슬라이드로 조절, 최초값 50)
		JSlider bSlider = new JSlider(-100, 100, 0);
		rightpanel.add(bSlider);
		bSlider.addChangeListener(new ChangeListener() {
			public void stateChanged(ChangeEvent e) {
				if (originalImage == null)
					return;
				int value = bSlider.getValue();
				currentImage = changeBrightness(originalImage, value);
				Image img = currentImage.getScaledInstance(panelwidth, panelheight, Image.SCALE_SMOOTH);
				imagelabel.setIcon(new ImageIcon(img));
			}
		});
		
		// 흑백 변환 함수 (클릭 시 흑백)
		JButton convertToGray = new JButton("흑백 변환");
		convertToGray.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent e) {
				if (originalImage == null)
					return;
				BufferedImage convertToGray = convertToGray(changeBrightness(originalImage, 0));
				originalImage = convertToGray;
				currentImage = convertToGray;
				originalIcon = new ImageIcon(convertToGray);
				Image img = currentImage.getScaledInstance(panelwidth, panelheight, Image.SCALE_SMOOTH);
				imagelabel.setIcon(new ImageIcon(img));
			}
		});
		rightpanel.add(convertToGray);
		
		JMenuBar menubar = new JMenuBar();
		JMenu filemenu = new JMenu("file");
		JMenu editmenu = new JMenu("edit");
		JMenu helpmenu = new JMenu("help");

		menubar.add(filemenu);
		menubar.add(editmenu);
		menubar.add(helpmenu);
		setJMenuBar(menubar);

		JMenuItem openitem = new JMenuItem("open");
		JMenuItem saveitem = new JMenuItem("save");
		JMenuItem exititem = new JMenuItem("exit");
		
		// 열기
		openitem.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent e) {
				JFileChooser chooser = new JFileChooser();
				int showOpenDialog = chooser.showOpenDialog(ImageViewer.this);
				if (showOpenDialog == JFileChooser.APPROVE_OPTION) {
					String path = chooser.getSelectedFile().getPath();
					originalIcon = new ImageIcon(path);
					originalImage = originalIcon.getImage();
					currentImage = originalImage;
					panelwidth = originalIcon.getIconWidth();
					panelheight = originalIcon.getIconHeight();

					Image img = originalIcon.getImage();
					Image scaledImg = img.getScaledInstance(panelwidth, panelheight, Image.SCALE_SMOOTH);

					imagelabel.setIcon(new ImageIcon(scaledImg));
					imagelabel.setBounds(0, 0, panelwidth, panelheight);
					desclabel.setText("주소: " + path);
				}
			}
		});
		
		// 저장
		saveitem.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent e) {
				JFileChooser chooser = new JFileChooser();
				int showSaveDialog = chooser.showSaveDialog(null);
			}
		});
		
		// 닫기
		exititem.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent e) {
				System.exit(0);
			}
		});

		filemenu.add(openitem);
		filemenu.add(saveitem);
		filemenu.add(exititem);

		setVisible(true);
	}

	//	이미지 밝기 조절
	public BufferedImage changeBrightness(Image image, float brightness) {
		BufferedImage bufferedImage = new BufferedImage(
				image.getWidth(null),
				image.getHeight(null),
				BufferedImage.TYPE_INT_RGB);

		Graphics g = bufferedImage.getGraphics();
		g.drawImage(image, 0, 0, null);
		g.dispose();

		RescaleOp op = new RescaleOp(1.0f, brightness, null);
		return op.filter(bufferedImage, null);
	}
	
	// 흑백 변환 함수
	public BufferedImage convertToGray(BufferedImage image) {
	    ColorConvertOp op = new ColorConvertOp(
	            ColorSpace.getInstance(ColorSpace.CS_GRAY),
	            null
	    );
	    return op.filter(image, null);
	}

	public static void main(String[] args) {
		ImageViewer iv = new ImageViewer();
	}
}

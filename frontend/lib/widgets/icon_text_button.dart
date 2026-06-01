import 'package:flutter/material.dart';

class IconTextButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final double scale;
  final Color? iconColor;
  final Color? textColor;

  const IconTextButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.scale = 1.0,
    this.iconColor,
    this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return Transform.scale(
      scale: scale, // ✅ aplica escala
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: const [
            BoxShadow(
              color: Colors.black26,
              blurRadius: 6,
              offset: Offset(0, 3),
            ),
          ],
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 20 * scale, color: iconColor ?? Colors.black87),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10 * scale,
                  color: textColor ?? Colors.black87,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

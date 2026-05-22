import 'package:flutter/material.dart';

class FuriganaText extends StatelessWidget {
  final String text;
  final String reading;

  const FuriganaText({super.key, required this.text, required this.reading});

  @override
  Widget build(BuildContext context) {
    return IntrinsicWidth(
      child: SizedBox(
        height: 48,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            Transform.translate(
              offset: const Offset(0, -3),
              child: Text(text, style: const TextStyle(fontSize: 24)),
            ),
            Positioned(
              top: -16,
              child: Text(
                reading,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

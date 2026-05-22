import 'package:flutter/material.dart';
import 'package:kanji_app/styles/app_text_styles.dart';

class FuriganaText extends StatelessWidget {
  final String text;
  final String reading;

  const FuriganaText({super.key, required this.text, required this.reading});

  @override
  Widget build(BuildContext context) {
    return IntrinsicWidth(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 1),
        child: SizedBox(
          height: 48,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Transform.translate(
                offset: const Offset(0, -3),
                child: Text(text, style: AppTextStyles.jpLarge),
              ),
              Positioned(
                top: -16,
                child: Text(reading, style: AppTextStyles.furigana),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

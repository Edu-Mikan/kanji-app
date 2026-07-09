import 'package:flutter/material.dart';

class ResponsivePage extends StatelessWidget {
  final Widget child;
  final double maxWidth;
  final EdgeInsetsGeometry padding;

  const ResponsivePage({
    super.key,
    required this.child,
    this.maxWidth = 1100,
    this.padding = const EdgeInsets.all(16),
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= 900;

        return Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: isDesktop ? maxWidth : constraints.maxWidth,
            ),
            child: Padding(
              padding: isDesktop
                  ? const EdgeInsets.symmetric(horizontal: 24, vertical: 20)
                  : padding,
              child: child,
            ),
          ),
        );
      },
    );
  }
}

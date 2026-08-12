import 'package:flutter/material.dart';
import 'package:kanji_app/models/review_sample.dart';

class StrokePreview extends StatelessWidget {
  final List<ReviewStroke> strokes;
  final double size;
  final Color strokeColor;
  final Color backgroundColor;
  final Color guideColor;
  final double strokeWidth;
  final bool showGuides;
  final String? semanticsLabel;

  const StrokePreview({
    super.key,
    required this.strokes,
    this.size = 180,
    this.strokeColor = Colors.black,
    this.backgroundColor = Colors.white,
    this.guideColor = const Color(0xFFBDBDBD),
    this.strokeWidth = 5,
    this.showGuides = true,
    this.semanticsLabel,
  });

  List<ReviewStroke> get validStrokes {
    return List<ReviewStroke>.unmodifiable(
      strokes.where((stroke) => stroke.isValid),
    );
  }

  @override
  Widget build(BuildContext context) {
    final previewStrokes = validStrokes;

    return Semantics(
      label:
          semanticsLabel ??
          'Vista previa de una muestra con '
              '${previewStrokes.length} trazos',
      image: true,
      child: SizedBox.square(
        dimension: size,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: backgroundColor,
              border: Border.all(color: Colors.black.withValues(alpha: 0.12)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: CustomPaint(
              painter: StrokePreviewPainter(
                strokes: previewStrokes,
                strokeColor: strokeColor,
                backgroundColor: backgroundColor,
                guideColor: guideColor,
                strokeWidth: strokeWidth,
                showGuides: showGuides,
              ),
              child: previewStrokes.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.gesture_outlined,
                            color: Colors.grey,
                            size: 32,
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Sin trazos',
                            style: TextStyle(color: Colors.grey, fontSize: 13),
                          ),
                        ],
                      ),
                    )
                  : null,
            ),
          ),
        ),
      ),
    );
  }
}

class StrokePreviewPainter extends CustomPainter {
  final List<ReviewStroke> strokes;
  final Color strokeColor;
  final Color backgroundColor;
  final Color guideColor;
  final double strokeWidth;
  final bool showGuides;
  final double padding;

  const StrokePreviewPainter({
    required this.strokes,
    required this.strokeColor,
    required this.backgroundColor,
    required this.guideColor,
    required this.strokeWidth,
    required this.showGuides,
    this.padding = 14,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final backgroundPaint = Paint()..color = backgroundColor;

    canvas.drawRect(Offset.zero & size, backgroundPaint);

    if (showGuides) {
      _drawGuides(canvas, size);
    }

    if (strokes.isEmpty) {
      return;
    }

    final drawableWidth = (size.width - padding * 2).clamp(
      0.0,
      double.infinity,
    );

    final drawableHeight = (size.height - padding * 2).clamp(
      0.0,
      double.infinity,
    );

    if (drawableWidth <= 0 || drawableHeight <= 0) {
      return;
    }

    final paint = Paint()
      ..color = strokeColor
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke
      ..isAntiAlias = true;

    for (final stroke in strokes) {
      if (!stroke.isValid) {
        continue;
      }

      final path = Path();

      for (var pointIndex = 0; pointIndex < stroke.pointCount; pointIndex++) {
        final normalizedX = stroke.x[pointIndex].clamp(0.0, 1.0).toDouble();

        final normalizedY = stroke.y[pointIndex].clamp(0.0, 1.0).toDouble();

        final x = padding + normalizedX * drawableWidth;

        final y = padding + normalizedY * drawableHeight;

        if (pointIndex == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }

      canvas.drawPath(path, paint);
    }
  }

  void _drawGuides(Canvas canvas, Size size) {
    final guidePaint = Paint()
      ..color = guideColor.withValues(alpha: 0.55)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    _drawDashedLine(
      canvas: canvas,
      start: Offset(size.width / 2, 0),
      end: Offset(size.width / 2, size.height),
      paint: guidePaint,
    );

    _drawDashedLine(
      canvas: canvas,
      start: Offset(0, size.height / 2),
      end: Offset(size.width, size.height / 2),
      paint: guidePaint,
    );
  }

  void _drawDashedLine({
    required Canvas canvas,
    required Offset start,
    required Offset end,
    required Paint paint,
    double dashLength = 4,
    double gapLength = 4,
  }) {
    final difference = end - start;
    final totalLength = difference.distance;

    if (totalLength <= 0) {
      return;
    }

    final direction = difference / totalLength;
    var travelled = 0.0;

    while (travelled < totalLength) {
      final segmentEnd = (travelled + dashLength).clamp(0.0, totalLength);

      canvas.drawLine(
        start + direction * travelled,
        start + direction * segmentEnd,
        paint,
      );

      travelled += dashLength + gapLength;
    }
  }

  @override
  bool shouldRepaint(covariant StrokePreviewPainter oldDelegate) {
    return oldDelegate.strokes != strokes ||
        oldDelegate.strokeColor != strokeColor ||
        oldDelegate.backgroundColor != backgroundColor ||
        oldDelegate.guideColor != guideColor ||
        oldDelegate.strokeWidth != strokeWidth ||
        oldDelegate.showGuides != showGuides ||
        oldDelegate.padding != padding;
  }
}

#!/bin/bash
# Analyze the ratio of .sum file sizes compared to their source files

echo "Analyzing .sum file size ratios..."
echo "=================================="
echo ""

total_source_size=0
total_sum_size=0
file_count=0
ratios=()

# Find all .sum files and analyze them
while IFS= read -r sum_file; do
  # Get the source file path (remove .sum extension)
  source_file="${sum_file%.sum}"

  # Check if source file exists
  if [ -f "$source_file" ]; then
    # Get file sizes in bytes
    source_size=$(stat -f%z "$source_file" 2>/dev/null || stat -c%s "$source_file" 2>/dev/null)
    sum_size=$(stat -f%z "$sum_file" 2>/dev/null || stat -c%s "$sum_file" 2>/dev/null)

    # Calculate ratio (sum / source) as percentage
    if [ "$source_size" -gt 0 ]; then
      ratio=$(awk "BEGIN {printf \"%.2f\", ($sum_size / $source_size) * 100}")
      ratios+=("$ratio")

      # Accumulate totals
      total_source_size=$((total_source_size + source_size))
      total_sum_size=$((total_sum_size + sum_size))
      file_count=$((file_count + 1))

      # Show individual file stats (only first 10 and outliers)
      if [ "$file_count" -le 10 ] || (( $(echo "$ratio > 50" | bc -l) )) || (( $(echo "$ratio < 10" | bc -l) )); then
        printf "%-60s %8d bytes -> %8d bytes (%6.2f%%)\n" \
          "$(basename "$source_file")" "$source_size" "$sum_size" "$ratio"
      fi
    fi
  fi
done < <(find . -name "*.sum" -not -path "*/node_modules/*" -not -path "*/.git/*")

echo ""
echo "=================================="
echo "Summary Statistics"
echo "=================================="
echo "Files analyzed: $file_count"
echo "Total source size: $(numfmt --to=iec-i --suffix=B $total_source_size 2>/dev/null || echo "$total_source_size bytes")"
echo "Total .sum size: $(numfmt --to=iec-i --suffix=B $total_sum_size 2>/dev/null || echo "$total_sum_size bytes")"

# Calculate overall average ratio
if [ "$file_count" -gt 0 ] && [ "$total_source_size" -gt 0 ]; then
  overall_ratio=$(awk "BEGIN {printf \"%.2f\", ($total_sum_size / $total_source_size) * 100}")
  echo "Overall ratio: $overall_ratio%"
  echo ""

  # Calculate mean ratio
  sum_ratios=0
  for r in "${ratios[@]}"; do
    sum_ratios=$(awk "BEGIN {print $sum_ratios + $r}")
  done
  mean_ratio=$(awk "BEGIN {printf \"%.2f\", $sum_ratios / $file_count}")
  echo "Mean ratio: $mean_ratio%"

  # Calculate median
  IFS=$'\n' sorted_ratios=($(sort -n <<<"${ratios[*]}"))
  unset IFS
  mid=$((file_count / 2))
  if [ $((file_count % 2)) -eq 0 ]; then
    median=$(awk "BEGIN {printf \"%.2f\", (${sorted_ratios[$mid-1]} + ${sorted_ratios[$mid]}) / 2}")
  else
    median="${sorted_ratios[$mid]}"
  fi
  echo "Median ratio: $median%"

  # Find min and max
  min_ratio="${sorted_ratios[0]}"
  max_ratio="${sorted_ratios[$((file_count-1))]}"
  echo "Min ratio: $min_ratio%"
  echo "Max ratio: $max_ratio%"

  echo ""
  echo "=================================="
  echo "Target Configuration: 25%"
  echo "Actual Performance: $overall_ratio%"

  if (( $(echo "$overall_ratio < 25" | bc -l) )); then
    echo "✓ PASS: .sum files are more compact than configured target"
  elif (( $(echo "$overall_ratio < 30" | bc -l) )); then
    echo "~ ACCEPTABLE: .sum files are slightly above target"
  else
    echo "✗ ABOVE TARGET: .sum files are larger than configured"
  fi
  echo "=================================="
fi

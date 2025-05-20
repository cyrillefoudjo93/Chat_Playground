import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

type Message = {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  parentId?: string;
};

interface TreeNode {
  id: string;
  name?: string;
  sender?: 'user' | 'ai';
  index?: number;
  children: TreeNode[];
}

interface ChatTreeVisualizationProps {
  messages?: Message[];
}

const ChatTreeVisualization: React.FC<ChatTreeVisualizationProps> = ({ messages = [] }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || messages.length === 0) return;

    // Clear previous visualization
    const svgContainer = d3.select(svgRef.current);
    svgContainer.selectAll("*").remove();

    // SVG dimensions
    const width = svgContainer.node()?.getBoundingClientRect().width ?? 300;
    const height = messages.length * 40 + 20;
    
    // Create hierarchical data structure
    const treeData: TreeNode = {
      id: "root",
      children: messages.map((msg, index) => ({
        id: msg.id,
        name: msg.sender === 'user' ? 'You' : 'AI',
        sender: msg.sender,
        index,
        children: []
      }))
    };

    // Create tree layout
    const treeLayout = d3.tree<TreeNode>().size([width - 40, height - 20]);
    const root = d3.hierarchy<TreeNode>(treeData);
    treeLayout(root);

    // Create SVG group for visualization
    const svg = svgContainer
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", "translate(20, 10)");

    // Create custom link generator
    const linkGenerator = d3.linkVertical<d3.HierarchyLink<TreeNode>, d3.HierarchyNode<TreeNode>>()
      .x(d => d.x ?? 0)
      .y(d => d.y ?? 0);

    // Add links between nodes
    const links = svg
      .selectAll<SVGPathElement, d3.HierarchyLink<TreeNode>>(".link")
      .data(root.links())
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", linkGenerator)
      .attr("fill", "none")
      .attr("stroke", "#555")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 1.5);

    // Add nodes
    const nodes = svg
      .selectAll<SVGGElement, d3.HierarchyNode<TreeNode>>(".node")
      .data(root.descendants().slice(1)) // Skip root
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.x ?? 0}, ${d.y ?? 0})`);

    // Add circles for nodes
    nodes
      .append("circle")
      .attr("r", 7)
      .style("fill", d => d.data.sender === 'user' ? "#4299e1" : "#68d391")
      .style("stroke", "#fff")
      .style("stroke-width", 2);

    // Add labels
    nodes
      .append("text")
      .attr("dy", "0.31em")
      .attr("x", d => ((d.x ?? 0) < width / 2 ? 9 : -9))
      .attr("text-anchor", d => ((d.x ?? 0) < width / 2 ? "start" : "end"))
      .text(d => `${d.data.name ?? ''} ${(d.data.index ?? 0) + 1}`)
      .style("fill", "#fff")
      .style("font-size", "12px");

  }, [messages]);

  return (
    <div className="h-full">
      {messages.length === 0 ? (
        <div className="flex justify-center items-center h-full text-gray-500">
          No messages yet
        </div>
      ) : (
        <svg ref={svgRef} className="w-full h-full"></svg>
      )}
    </div>
  );
};

export default ChatTreeVisualization;